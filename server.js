const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const { createReadStream } = require('fs');
const { watch } = require('fs');

const app = express();
const port = 3010;
const promptsDir = path.join(__dirname, 'prompts');

// Configuration CORS
app.use(cors());
app.use(express.static(__dirname));

// Cache pour stocker les données et éviter les lectures répétées
let promptsCache = null;
let cacheTimestamp = null;

/**
 * Vérifie si le dossier prompts existe, sinon le crée
 */
async function ensurePromptsDirectory() {
    try {
        await fs.access(promptsDir);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('📁 Création du dossier prompts...');
            await fs.mkdir(promptsDir, { recursive: true });
            
            // Créer un dossier exemple avec un prompt de démonstration
            const exampleDir = path.join(promptsDir, 'exemples');
            await fs.mkdir(exampleDir, { recursive: true });
            
            const examplePrompt = `# Prompt d'exemple

Voici un exemple de prompt pour vous aider à démarrer.

## Instructions
- Créez vos dossiers de catégories dans le dossier 'prompts'
- Ajoutez vos fichiers .md dans ces dossiers
- Les changements sont détectés automatiquement

## Utilisation
Ce prompt sera automatiquement chargé dans votre interface web.`;

            await fs.writeFile(path.join(exampleDir, 'bienvenue.md'), examplePrompt);
            console.log('✅ Dossier prompts créé avec un exemple');
        }
    }
}

/**
 * Lit récursivement la structure des dossiers et fichiers Markdown
 */
async function readPromptsDirectory(currentDir) {
    const categories = [];
    
    try {
        const dirents = await fs.readdir(currentDir, { withFileTypes: true });
        
        // Trier les entrées par nom pour un ordre cohérent
        const sortedDirents = dirents.sort((a, b) => a.name.localeCompare(b.name));
        
        for (const dirent of sortedDirents) {
            if (!dirent.isDirectory()) continue;
            
            const categoryPath = path.join(currentDir, dirent.name);
            const files = await readMarkdownFiles(categoryPath);
            
            if (files.length > 0) {
                categories.push({
                    category: dirent.name,
                    files: files.sort((a, b) => a.name.localeCompare(b.name))
                });
            }
        }
    } catch (error) {
        console.error(`❌ Erreur lors de la lecture du répertoire ${currentDir}:`, error.message);
        throw error;
    }
    
    return categories;
}

/**
 * Lit tous les fichiers Markdown d'un dossier
 */
async function readMarkdownFiles(folderPath) {
    const files = [];
    
    try {
        const dirents = await fs.readdir(folderPath, { withFileTypes: true });
        
        for (const dirent of dirents) {
            if (dirent.isFile() && dirent.name.endsWith('.md')) {
                const filePath = path.join(folderPath, dirent.name);
                
                try {
                    const content = await fs.readFile(filePath, 'utf8');
                    const name = path.basename(dirent.name, '.md')
                        .replace(/_/g, ' ')
                        .replace(/-/g, ' ')
                        .trim();
                    
                    files.push({ name, content });
                } catch (readError) {
                    console.warn(`⚠️  Impossible de lire le fichier ${filePath}:`, readError.message);
                }
            }
        }
    } catch (error) {
        console.warn(`⚠️  Impossible de lire le dossier ${folderPath}:`, error.message);
    }
    
    return files;
}

/**
 * Met à jour le cache des prompts
 */
async function updateCache() {
    try {
        console.log('🔄 Mise à jour du cache des prompts...');
        promptsCache = await readPromptsDirectory(promptsDir);
        cacheTimestamp = Date.now();
        console.log(`✅ Cache mis à jour: ${promptsCache.length} catégories trouvées`);
        
        // Envoyer les données mises à jour aux clients connectés via SSE
        broadcastUpdate();
    } catch (error) {
        console.error('❌ Erreur lors de la mise à jour du cache:', error.message);
        promptsCache = [];
    }
}

/**
 * Surveillance des changements dans le dossier prompts
 */
function watchPromptsDirectory() {
    let timeout;
    
    try {
        const watcher = watch(promptsDir, { recursive: true }, (eventType, filename) => {
            if (filename && filename.endsWith('.md')) {
                console.log(`📝 Changement détecté: ${eventType} - ${filename}`);
                
                // Débouncing: attendre 500ms avant de mettre à jour
                clearTimeout(timeout);
                timeout = setTimeout(updateCache, 500);
            }
        });
        
        console.log('👀 Surveillance des changements activée sur:', promptsDir);
        
        // Gérer l'arrêt propre
        process.on('SIGINT', () => {
            console.log('\n🛑 Arrêt du serveur...');
            watcher.close();
            process.exit(0);
        });
        
    } catch (error) {
        console.warn('⚠️  Impossible de surveiller les changements:', error.message);
    }
}

// Stockage des connexions SSE pour les mises à jour en temps réel
const sseClients = new Set();

/**
 * Diffuse les mises à jour aux clients connectés
 */
function broadcastUpdate() {
    const data = JSON.stringify({
        type: 'update',
        data: promptsCache,
        timestamp: cacheTimestamp
    });
    
    sseClients.forEach(client => {
        try {
            client.write(`data: ${data}\n\n`);
        } catch (error) {
            sseClients.delete(client);
        }
    });
}

// Routes API
app.get('/api/prompts', async (req, res) => {
    try {
        // Si le cache est vide ou n'existe pas, le mettre à jour
        if (!promptsCache) {
            await updateCache();
        }
        
        res.json({
            data: promptsCache,
            timestamp: cacheTimestamp,
            count: promptsCache.length
        });
    } catch (error) {
        console.error('❌ Erreur API /api/prompts:', error.message);
        res.status(500).json({ 
            error: 'Échec de la récupération des prompts',
            message: error.message 
        });
    }
});

// Route pour les mises à jour en temps réel (Server-Sent Events)
app.get('/api/updates', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });
    
    // Envoyer les données actuelles immédiatement
    if (promptsCache) {
        const data = JSON.stringify({
            type: 'initial',
            data: promptsCache,
            timestamp: cacheTimestamp
        });
        res.write(`data: ${data}\n\n`);
    }
    
    // Ajouter le client à la liste
    sseClients.add(res);
    
    // Nettoyer quand le client se déconnecte
    req.on('close', () => {
        sseClients.delete(res);
    });
});

// Route pour forcer la mise à jour du cache
app.post('/api/refresh', async (req, res) => {
    try {
        await updateCache();
        res.json({ 
            success: true, 
            message: 'Cache mis à jour',
            timestamp: cacheTimestamp 
        });
    } catch (error) {
        res.status(500).json({ 
            error: 'Échec de la mise à jour',
            message: error.message 
        });
    }
});

// Initialisation du serveur
async function startServer() {
    try {
        await ensurePromptsDirectory();
        await updateCache();
        watchPromptsDirectory();
        
        app.listen(port, () => {
            console.log(`🚀 Serveur démarré sur http://localhost:${port}`);
            console.log(`📱 Interface web: http://localhost:${port}/index.html`);
            console.log(`📂 Dossier prompts: ${promptsDir}`);
            console.log(`📊 ${promptsCache.length} catégories chargées`);
        });
    } catch (error) {
        console.error('❌ Erreur lors du démarrage du serveur:', error.message);
        process.exit(1);
    }
}

// Démarrer le serveur
startServer();