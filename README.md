# 📝 Smart Prompts Manager

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

A modern web application to manage, organize, and easily reuse your prompts through an intuitive and responsive interface.

## ✨ Features

- 🗂️ **Category Organization** - Structure your prompts in folders and subfolders
- ⚡ **Real-time Updates** - Changes are automatically detected
- 📋 **Quick Copy** - One click to copy content to clipboard
- 🔍 **Integrated Search** - Quickly find the prompt you need
- 🎨 **Modern Interface** - Clean and responsive design with smooth animations
- 📱 **Responsive** - Works on all devices
- 🔄 **Automatic Synchronization** - No need to refresh the page

## 🚀 Quick Start

### Prerequisites

- Node.js 14.0.0 or higher
- npm (included with Node.js)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/prompts-manager.git
   cd prompts-manager
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

4. **Open in browser**
   ```
   http://localhost:3010
   ```

## 🛠 Project Structure

```
prompts-manager/
├── prompts/               # Folder containing prompt categories
│   ├── category1/         # Category folder
│   │   ├── prompt1.md     # Prompt file
│   │   └── prompt2.md     # Another prompt
│   └── category2/         # Another category
│       └── prompt3.md
├── public/                # Static files
│   └── index.html         # User interface
├── server.js              # Main server
├── package.json           # Dependencies and scripts
└── README.md              # This file
```

## 📚 Prompt Format

Create Markdown files (`.md`) in category folders. The filename (without extension) will be used as the prompt name.

Example prompt structure:

```markdown
# Prompt Name

Detailed description of the prompt and its usage.

## Instructions

1. First step
2. Second step
3. Third step

## Example

```python
def example():
    return "This is a code example"
```

## Notes

- Important point 1
- Important point 2
```

## 🔌 API Endpoints

- `GET /api/prompts` - Retrieves all prompts organized by category
- `GET /api/updates` - SSE endpoint for real-time updates
- `GET /` - Web user interface

## 🛠 Technologies Used

- **Backend**
  - Node.js
  - Express
  - File System (FS) API
  - Server-Sent Events (SSE)

- **Frontend**
  - HTML5 / CSS3
  - JavaScript (ES6+)
  - Tailwind CSS
  - Font Awesome
  - Animate.css (for animations)

- **Development Tools**
  - Nodemon (automatic reload)
  - npm (package management)

## 📦 Deployment

To start the production server:

```bash
npm start
```

The application will be available at `http://localhost:3010`

## 🤝 Contributing

Contributions are welcome! Here's how to contribute:

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Icons by [Font Awesome](https://fontawesome.com/)
- Default font: [Inter](https://rsms.me/inter/)
- CSS Framework: [Tailwind CSS](https://tailwindcss.com/)

---

Developed with ❤️ by [Your Name](https://github.com/your-username)