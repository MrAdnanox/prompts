const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const { watch } = require('fs');

class PromptsServer {
    constructor(port = 3010, promptsDir = 'prompts') {
        this.app = express();
        this.port = port;
        this.promptsDir = path.join(__dirname, promptsDir);
        this.cache = new Map();
        this.sseClients = new Set();
        this.watcher = null;
        this.updateTimeout = null;
        
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(cors({
            origin: true,
            credentials: true
        }));
        this.app.use(express.static(__dirname));
        this.app.use(express.json({ limit: '10mb' }));
    }

    setupRoutes() {
        this.app.get('/api/prompts', this.handleGetPrompts.bind(this));
        this.app.get('/api/updates', this.handleSSE.bind(this));
        this.app.post('/api/refresh', this.handleRefresh.bind(this));
        
        // Route de santé
        this.app.get('/health', (req, res) => {
            res.json({ 
                status: 'healthy', 
                categories: this.cache.size,
                uptime: process.uptime()
            });
        });
    }

    async ensurePromptsDirectory() {
        try {
            await fs.access(this.promptsDir);
            console.log('📁 Dossier prompts trouvé');
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('📁 Création du dossier prompts...');
                await this.createInitialStructure();
            } else {
                throw error;
            }
        }
    }

    async createInitialStructure() {
        await fs.mkdir(this.promptsDir, { recursive: true });
        
        const exampleDir = path.join(this.promptsDir, 'exemples');
        await fs.mkdir(exampleDir, { recursive: true });
        
        const exampleContent = this.getExamplePrompt();
        await fs.writeFile(path.join(exampleDir, 'bienvenue.md'), exampleContent);
        
        console.log('✅ Structure initiale créée');
    }

    getExamplePrompt() {
        return `# Prompt d'exemple

Voici un exemple de prompt pour vous aider à démarrer.

## Instructions
- Créez vos dossiers de catégories dans le dossier 'prompts'
- Ajoutez vos fichiers .md dans ces dossiers
- Les changements sont détectés automatiquement

## Utilisation
Ce prompt sera automatiquement chargé dans votre interface web.`;
    }

    async readPromptsDirectory() {
        const categories = [];
        
        try {
            const dirents = await fs.readdir(this.promptsDir, { withFileTypes: true });
            const directories = dirents
                .filter(dirent => dirent.isDirectory())
                .sort((a, b) => a.name.localeCompare(b.name));
            
            // Traitement parallèle des catégories avec limitation de concurrence
            const concurrencyLimit = 5;
            for (let i = 0; i < directories.length; i += concurrencyLimit) {
                const batch = directories.slice(i, i + concurrencyLimit);
                const batchResults = await Promise.allSettled(
                    batch.map(dirent => this.processCategory(dirent))
                );
                
                batchResults.forEach((result, index) => {
                    if (result.status === 'fulfilled' && result.value) {
                        categories.push(result.value);
                    } else if (result.status === 'rejected') {
                        console.warn(`⚠️ Erreur catégorie ${batch[index].name}:`, result.reason.message);
                    }
                });
            }
        } catch (error) {
            console.error(`❌ Erreur lecture répertoire:`, error.message);
            throw error;
        }
        
        return categories;
    }

    async processCategory(dirent) {
        const categoryPath = path.join(this.promptsDir, dirent.name);
        const files = await this.readMarkdownFiles(categoryPath);
        
        if (files.length === 0) return null;
        
        return {
            category: dirent.name,
            files: files.sort((a, b) => a.name.localeCompare(b.name)),
            lastModified: Date.now()
        };
    }

    async readMarkdownFiles(folderPath) {
        try {
            const dirents = await fs.readdir(folderPath, { withFileTypes: true });
            const markdownFiles = dirents.filter(
                dirent => dirent.isFile() && dirent.name.endsWith('.md')
            );
            
            // Lecture parallèle des fichiers
            const filesPromises = markdownFiles.map(dirent => 
                this.readSingleMarkdownFile(folderPath, dirent)
            );
            
            const results = await Promise.allSettled(filesPromises);
            return results
                .filter(result => result.status === 'fulfilled' && result.value)
                .map(result => result.value);
                
        } catch (error) {
            console.warn(`⚠️ Impossible de lire le dossier ${folderPath}:`, error.message);
            return [];
        }
    }

    async readSingleMarkdownFile(folderPath, dirent) {
        const filePath = path.join(folderPath, dirent.name);
        
        try {
            const [content, stats] = await Promise.all([
                fs.readFile(filePath, 'utf8'),
                fs.stat(filePath)
            ]);
            
            const name = this.formatFileName(dirent.name);
            
            return { 
                name, 
                content: content.trim(),
                size: stats.size,
                lastModified: stats.mtime.toISOString()
            };
        } catch (error) {
            console.warn(`⚠️ Impossible de lire ${filePath}:`, error.message);
            return null;
        }
    }

    formatFileName(filename) {
        return path.basename(filename, '.md')
            .replace(/[_-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    async updateCache() {
        try {
            console.log('🔄 Mise à jour du cache...');
            const startTime = Date.now();
            
            const categories = await this.readPromptsDirectory();
            
            // Mise à jour atomique du cache
            this.cache.clear();
            categories.forEach((category, index) => {
                this.cache.set(category.category, {
                    ...category,
                    index
                });
            });
            
            const duration = Date.now() - startTime;
            console.log(`✅ Cache mis à jour: ${categories.length} catégories (${duration}ms)`);
            
            this.broadcastUpdate(categories);
            return categories;
        } catch (error) {
            console.error('❌ Erreur mise à jour cache:', error.message);
            return Array.from(this.cache.values());
        }
    }

    setupFileWatcher() {
        if (this.watcher) {
            this.watcher.close();
        }

        try {
            this.watcher = watch(this.promptsDir, { recursive: true }, (eventType, filename) => {
                if (filename && filename.endsWith('.md')) {
                    console.log(`📝 Changement détecté: ${eventType} - ${filename}`);
                    this.debouncedUpdate();
                }
            });
            
            console.log('👀 Surveillance activée:', this.promptsDir);
        } catch (error) {
            console.warn('⚠️ Impossible de surveiller les changements:', error.message);
        }
    }

    debouncedUpdate() {
        clearTimeout(this.updateTimeout);
        this.updateTimeout = setTimeout(() => {
            this.updateCache();
        }, 500);
    }

    broadcastUpdate(data = null) {
        if (this.sseClients.size === 0) return;

        const payload = {
            type: 'update',
            data: data || Array.from(this.cache.values()),
            timestamp: Date.now()
        };

        const message = `data: ${JSON.stringify(payload)}\n\n`;
        const deadClients = new Set();

        this.sseClients.forEach(client => {
            try {
                client.write(message);
            } catch (error) {
                deadClients.add(client);
            }
        });

        // Nettoyage des connexions mortes
        deadClients.forEach(client => this.sseClients.delete(client));
    }

    async handleGetPrompts(req, res) {
        try {
            let data = Array.from(this.cache.values());
            
            if (data.length === 0) {
                data = await this.updateCache();
            }
            
            res.json({
                data,
                timestamp: Date.now(),
                count: data.length,
                cacheSize: this.cache.size
            });
        } catch (error) {
            console.error('❌ Erreur API /api/prompts:', error.message);
            res.status(500).json({ 
                error: 'Échec de la récupération des prompts',
                message: error.message 
            });
        }
    }

    handleSSE(req, res) {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control'
        });

        // Données initiales
        const initialData = {
            type: 'initial',
            data: Array.from(this.cache.values()),
            timestamp: Date.now()
        };
        res.write(`data: ${JSON.stringify(initialData)}\n\n`);

        // Heartbeat pour maintenir la connexion
        const heartbeat = setInterval(() => {
            try {
                res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`);
            } catch (error) {
                clearInterval(heartbeat);
                this.sseClients.delete(res);
            }
        }, 30000);

        this.sseClients.add(res);

        req.on('close', () => {
            clearInterval(heartbeat);
            this.sseClients.delete(res);
        });
    }

    async handleRefresh(req, res) {
        try {
            const data = await this.updateCache();
            res.json({ 
                success: true, 
                message: 'Cache mis à jour',
                count: data.length,
                timestamp: Date.now()
            });
        } catch (error) {
            res.status(500).json({ 
                error: 'Échec de la mise à jour',
                message: error.message 
            });
        }
    }

    async start() {
        try {
            await this.ensurePromptsDirectory();
            await this.updateCache();
            this.setupFileWatcher();
            
            const server = this.app.listen(this.port, () => {
                console.log(`🚀 Serveur démarré sur http://localhost:${this.port}`);
                console.log(`📱 Interface web: http://localhost:${this.port}/index.html`);
                console.log(`📂 Dossier prompts: ${this.promptsDir}`);
                console.log(`📊 ${this.cache.size} catégories chargées`);
            });

            // Gestion propre de l'arrêt
            this.setupGracefulShutdown(server);
            
            return server;
        } catch (error) {
            console.error('❌ Erreur démarrage serveur:', error.message);
            process.exit(1);
        }
    }

    setupGracefulShutdown(server) {
        const shutdown = async (signal) => {
            console.log(`\n🛑 Arrêt du serveur (${signal})...`);
            
            // Fermer les connexions SSE
            this.sseClients.forEach(client => {
                try {
                    client.end();
                } catch (error) {
                    // Ignorer les erreurs de fermeture
                }
            });
            this.sseClients.clear();
            
            // Fermer le watcher
            if (this.watcher) {
                this.watcher.close();
            }
            
            // Fermer le serveur
            server.close((err) => {
                if (err) {
                    console.error('❌ Erreur lors de la fermeture:', err.message);
                    process.exit(1);
                } else {
                    console.log('✅ Serveur fermé proprement');
                    process.exit(0);
                }
            });
            
            // Force l'arrêt après 10 secondes
            setTimeout(() => {
                console.log('⚠️ Arrêt forcé');
                process.exit(1);
            }, 10000);
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
    }
}

// Utilisation
const server = new PromptsServer();
server.start().catch(console.error);

module.exports = PromptsServer;