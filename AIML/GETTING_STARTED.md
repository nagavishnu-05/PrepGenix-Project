# AIML Module - Getting Started Guide

This guide will help you run the AIML module quickly, just like you run the Frontend and Backend with `npm run dev`.

---

## ⚡ Quick Start (TL;DR)

### Windows Users
```bash
cd AIML
pip install -r requirements.txt
python run.py
```

### Mac/Linux Users
```bash
cd AIML
pip install -r requirements.txt
python run.py
```

Server will start on **http://localhost:5000**

---

## 📋 Prerequisites

Make sure you have:
- ✅ Python 3.8+ installed
- ✅ pip (Python package manager)

Check your Python version:
```bash
python --version
```

If you don't have Python, download from https://www.python.org/

---

## 🚀 Installation & Running

### Step 1: Navigate to AIML Folder
```bash
cd AIML
```

### Step 2: Install Dependencies (First Time Only)
```bash
pip install -r requirements.txt
```

This installs:
- TensorFlow (AI/ML)
- OpenCV (Face detection)
- Flask (API server)
- And other required packages

### Step 3: Run the Server
```bash
python run.py
```

You should see:
```
🚀 Starting AIML API Server (Development Mode)
📍 Server: http://0.0.0.0:5000
📚 API Docs available at endpoints listed below
```

---

## 🎯 What Can You Do Now?

### 1. Check Server Health
Visit: http://localhost:5000/api/health

### 2. Analyze Proctoring (Face & Voice Detection)
Send image/audio files to analyze:
```bash
curl -X POST -F "image=@frame.jpg" http://localhost:5000/api/analyze-proctor
```

### 3. Parse Resume & Extract Skills
Upload a resume to extract skills:
```bash
curl -X POST -F "file=@resume.pdf" http://localhost:5000/api/parse-resume
```

### 4. Get Available Skills List
Visit: http://localhost:5000/api/available-skills

---

## 🖥️ Windows Users - Easier Way

Use the included batch file:

```bash
# Start server
dev.bat serve

# Install dependencies
dev.bat setup

# Run analyzer
dev.bat analyze --image frame.jpg --audio audio.wav

# Parse resume
dev.bat parse --input resume.pdf
```

---

## 🐧 Mac/Linux Users - Using Make

Use the included Makefile:

```bash
# Start development server
make dev

# Install dependencies
make install

# Run analyzer
make analyze IMAGE=frame.jpg AUDIO=audio.wav

# Parse resume
make parse INPUT=resume.pdf
```

---

## 🔌 Using Different Port

If port 5000 is already in use:

```bash
python run.py --port 3001
```

Server will start on http://localhost:3001

---

## 🆘 Troubleshooting

### "Python not found" or "pip not found"
- **Windows**: Reinstall Python and check "Add Python to PATH"
- **Mac/Linux**: Use `python3` and `pip3` instead

### "Permission denied" errors on Mac/Linux
```bash
chmod +x run.py
python3 run.py
```

### "Port 5000 already in use"
Use a different port:
```bash
python run.py --port 3001
```

### "Missing dependencies"
Reinstall everything:
```bash
pip install --upgrade -r requirements.txt
```

### OpenCV errors (cv2)
```bash
pip install --upgrade opencv-python
```

---

## 📚 API Quick Reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/health` | Check if server is running |
| POST | `/api/analyze-proctor` | Analyze face/voice from image/audio |
| POST | `/api/parse-resume` | Extract skills from resume |
| GET | `/api/available-skills` | List all skill categories |

---

## 🔗 Integrating with Frontend/Backend

### From Backend (Express)
```javascript
// Upload file to AIML API
const FormData = require('form-data');
const fs = require('fs');
const axios = require('axios');

const formData = new FormData();
formData.append('file', fs.createReadStream('resume.pdf'));

axios.post('http://localhost:5000/api/parse-resume', formData, {
  headers: formData.getHeaders()
}).then(res => console.log(res.data));
```

### From Frontend (React)
```jsx
const handleResumeParse = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch('http://localhost:5000/api/parse-resume', {
    method: 'POST',
    body: formData
  });
  
  const data = await response.json();
  console.log(data.skills); // ["Python", "React", ...]
};
```

---

## 📖 Full Documentation

See `README.md` in the AIML folder for complete documentation.

---

## ✅ Next Steps

1. ✅ Run the server: `python run.py`
2. ✅ Test an endpoint: Visit http://localhost:5000/api/health
3. ✅ Integrate with Frontend/Backend
4. ✅ Read full `README.md` for advanced usage

---

## 💡 Tips

- Keep the terminal window open while developing
- Server automatically reloads on file changes in development mode
- Use different ports for Frontend, Backend, and AIML to avoid conflicts
- Check logs in terminal for error messages

---

## 🆘 Need Help?

- Check `README.md` for complete API documentation
- Review `run.py` for all available commands
- Check error messages in terminal for specific issues
- Ensure all dependencies are installed: `pip install -r requirements.txt`
