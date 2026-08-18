# AIML Module - Interview Coding Assessment Platform

Complete AI/ML module for proctoring analysis and resume parsing with integrated Flask API server.

## 🚀 Quick Start

### Option 1: Run API Server (Recommended - Like `npm run dev`)

```bash
# Navigate to AIML folder
cd AIML

# Install dependencies (one-time)
pip install -r requirements.txt

# Start the development server
python run.py
```

Server starts on `http://localhost:5000`

---

### Option 2: Run Individual Scripts

#### Analyze Proctoring (Face & Voice Detection)
```bash
python main.py analyze-proctor --image frame.jpg [--audio audio.wav]
```

#### Parse Resume & Extract Skills
```bash
python main.py parse-resume --input resume.pdf --out result.json
```

---

## 📋 Setup Instructions

### Prerequisites
- Python 3.8 or higher
- pip (Python package manager)

### Step 1: Install Dependencies

```bash
cd AIML
pip install -r requirements.txt
```

**Required packages:**
- `tensorflow`, `keras` - Deep learning
- `opencv-python` - Face detection
- `scikit-learn` - ML algorithms
- `pandas`, `numpy` - Data processing
- `jupyter` - Notebooks
- `pypdf` - PDF parsing
- `flask` - API server

### Step 2: Run in Development Mode

```bash
python run.py
```

Or with custom port:
```bash
python run.py --port 3001
```

---

## 🎯 Available Commands

### Start API Server (Development)
```bash
python run.py
python run.py serve --host 0.0.0.0 --port 5000
```

### Setup Environment
```bash
python run.py setup
```
Installs dependencies and checks Python version.

### Analyze Proctoring
```bash
python run.py analyze --image frame.jpg --audio audio.wav
```

### Parse Resume
```bash
python run.py parse --input resume.pdf --out output.json
```

---

## 🌐 API Endpoints

### Health Check
```http
GET /api/health
```
**Response:**
```json
{
  "status": "healthy",
  "service": "AIML Interview Assessment API"
}
```

### Analyze Proctoring
```http
POST /api/analyze-proctor
Content-Type: multipart/form-data

Parameters:
  - image (file, optional): jpg/png for face detection
  - audio (file, optional): wav for voice detection
```

**Response:**
```json
{
  "image": {
    "faces": 1,
    "facePresent": true,
    "multipleFaces": false,
    "note": "Single face detected"
  },
  "audio": {
    "voiceDetected": true,
    "voicedRatio": 0.65,
    "rms": 150.5,
    "note": "Voice detected"
  }
}
```

### Parse Resume
```http
POST /api/parse-resume
Content-Type: multipart/form-data

Parameters:
  - file (file, required): pdf/txt resume file
```

**Response:**
```json
{
  "skills": ["Python", "React", "MongoDB", "Node.js"],
  "categories": [
    {"name": "Full Stack Developer", "score": 0.85},
    {"name": "Backend Developer", "score": 0.75}
  ],
  "text": "extracted resume text..."
}
```

### Available Skills
```http
GET /api/available-skills
```
Returns all skill categories from `data/skills.json`.

---

## 📂 Project Structure

```
AIML/
├── run.py                 # Main development runner (like npm run dev)
├── main.py               # CLI entry point for all commands
├── server.py             # Flask API server
├── setup.py              # Package setup configuration
├── requirements.txt      # Python dependencies
│
├── scripts/
│   ├── analyze_proctor.py    # Face & voice detection
│   └── parse_resume.py        # Resume parsing & skill extraction
│
├── data/
│   └── skills.json            # Skill categories and keywords
│
├── models/               # Pre-trained models (placeholder)
└── notebooks/            # Jupyter notebooks (placeholder)
```

---

## 🔧 Development Workflow

### 1. Initial Setup
```bash
cd AIML
python run.py setup
```

### 2. Start Development Server
```bash
python run.py
```
Server runs on `http://localhost:5000`

### 3. Test with cURL

**Analyze image:**
```bash
curl -X POST -F "image=@frame.jpg" http://localhost:5000/api/analyze-proctor
```

**Parse resume:**
```bash
curl -X POST -F "file=@resume.pdf" http://localhost:5000/api/parse-resume
```

### 4. Use Python CLI

```bash
# Direct CLI
python main.py analyze-proctor --image frame.jpg --audio audio.wav
python main.py parse-resume --input resume.pdf --out result.json

# Via run.py wrapper
python run.py analyze --image frame.jpg --audio audio.wav
python run.py parse --input resume.pdf --out result.json
```

---

## 🐍 Using with Jupyter Notebooks

Start Jupyter server:
```bash
jupyter notebook
```

Access notebooks at `http://localhost:8888`

---

## 🐛 Troubleshooting

### OpenCV Issues on Windows
If you encounter OpenCV errors, install Visual C++ Build Tools:
```bash
pip install --upgrade opencv-python
```

### TensorFlow/CUDA Issues
For CPU-only (recommended for testing):
```bash
pip install tensorflow-cpu
```

### PDF Parsing Issues
Ensure pypdf is installed:
```bash
pip install pypdf
```

### Port Already in Use
Use a different port:
```bash
python run.py --port 3001
```

---

## 📝 Integrating with Backend/Frontend

### Backend Integration
Make requests to AIML API from Express:
```javascript
const FormData = require('form-data');
const fs = require('fs');
const http = require('http');

const form = new FormData();
form.append('image', fs.createReadStream('frame.jpg'));

http.post('http://localhost:5000/api/analyze-proctor', form, (res) => {
  // Handle response
});
```

### Frontend Integration
Use FormData for file uploads:
```javascript
const formData = new FormData();
formData.append('image', imageFile);
formData.append('audio', audioFile);

const response = await fetch('http://localhost:5000/api/analyze-proctor', {
  method: 'POST',
  body: formData
});

const result = await response.json();
```

---

## 🚀 Production Deployment

For production, use Gunicorn:
```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 server:app
```

---

## 📚 API Documentation

Visit `http://localhost:5000/api/health` to verify server is running.

Full endpoint reference:
- `GET  /api/health` - Health check
- `POST /api/analyze-proctor` - Proctoring analysis
- `POST /api/parse-resume` - Resume parsing
- `GET  /api/available-skills` - List available skills

---

## 🤝 Contributing

For adding new functionalities:

1. Add script in `scripts/` folder
2. Add CLI command in `main.py`
3. Add API endpoint in `server.py`
4. Update `requirements.txt` if new dependencies needed
5. Test via `run.py` or `main.py`

---

## 📄 License

Part of Interview Coding Assessment Platform
