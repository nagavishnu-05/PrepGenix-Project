# Interview Coding Assessment Platform - Complete Setup Guide

Complete guide to run the entire project (Frontend + Backend + AIML) with all functionalities.

---

## 🎯 Overview

This is a three-tier application:

| Service | Port | Stack | Command |
|---------|------|-------|---------|
| **Frontend** | 5173 | React 19 + Vite | `cd Frontend && npm run dev` |
| **Backend** | 3000 | Express + Node.js | `cd Backend && npm run dev` |
| **AIML** | 5000 | Python + Flask | `cd AIML && python run.py` |

---

## ⚡ Quick Start - Run All Services

### Option 1: Docker Compose (Easiest)

```bash
# Start all services together
docker-compose up

# In separate terminal to see logs
docker-compose logs -f

# Stop all services
docker-compose down
```

All services will start automatically:
- Frontend: http://localhost:5173
- Backend: http://localhost:3000
- AIML API: http://localhost:5000
- MongoDB: localhost:27017

### Option 2: Run Manually (Each in Terminal)

#### Terminal 1: Start Backend
```bash
cd Backend
npm install
npm run dev
```
Runs on http://localhost:3000

#### Terminal 2: Start Frontend
```bash
cd Frontend
npm install
npm run dev
```
Runs on http://localhost:5173

#### Terminal 3: Start AIML
```bash
cd AIML
pip install -r requirements.txt
python run.py
```
Runs on http://localhost:5000

#### Terminal 4 (Optional): MongoDB
```bash
# If using local MongoDB
mongod
```
Or use MongoDB Atlas cloud connection

---

## 📋 Prerequisites

### For Running Manually:
- **Node.js 18+** and npm
- **Python 3.8+** and pip
- **MongoDB** (local or cloud connection)

### For Docker Compose:
- Docker Desktop installed

---

## 🚀 Detailed Setup Instructions

### 1️⃣ Frontend Setup

```bash
cd Frontend

# Install dependencies
npm install

# Start development server
npm run dev

# Runs on: http://localhost:5173
# Vite will auto-reload on file changes
```

**Common commands:**
```bash
npm run build      # Build for production
npm run preview    # Preview production build
npm run lint       # Check code quality
```

### 2️⃣ Backend Setup

```bash
cd Backend

# Install dependencies
npm install

# Start development server
npm run dev

# Runs on: http://localhost:3000
# Nodemon will auto-reload on file changes
```

**Common commands:**
```bash
npm run build      # Build for production
npm test           # Run tests
npm run seed       # Seed database with sample data
```

**Environment Setup:**
Create `.env` file in Backend folder:
```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/interview_assessment
JWT_SECRET=your_secret_key_here
AIML_API_URL=http://localhost:5000
```

### 3️⃣ AIML Setup

```bash
cd AIML

# Install dependencies
pip install -r requirements.txt

# Start development server
python run.py

# Runs on: http://localhost:5000
```

**Alternative commands:**
```bash
python run.py --port 3001              # Custom port
python main.py analyze-proctor --image frame.jpg
python main.py parse-resume --input resume.pdf
```

---

## 🔗 Service Integration

### Frontend → Backend
```javascript
// Frontend calls Backend API
const response = await fetch('http://localhost:3000/api/...', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});
```

### Backend → AIML
```javascript
// Backend forwards requests to AIML
const aimlResponse = await fetch('http://localhost:5000/api/parse-resume', {
  method: 'POST',
  body: formData
});
```

### Frontend → AIML (Direct)
```javascript
// Frontend can also call AIML directly for real-time analysis
const response = await fetch('http://localhost:5000/api/analyze-proctor', {
  method: 'POST',
  body: formData
});
```

---

## 🐳 Docker Compose Usage

### Start Services
```bash
# Start all services in background
docker-compose up -d

# Start with live logs
docker-compose up

# Stop services
docker-compose down

# Remove all data and volumes
docker-compose down -v
```

### View Logs
```bash
# All services
docker-compose logs

# Specific service
docker-compose logs backend
docker-compose logs frontend
docker-compose logs aiml

# Live logs
docker-compose logs -f
```

### Access Services
```bash
# Frontend
http://localhost:5173

# Backend API
http://localhost:3000/api/health

# AIML API
http://localhost:5000/api/health

# MongoDB
mongodb://admin:password@localhost:27017
```

---

## 🎮 Testing the Integration

### 1. Upload Resume (Frontend → Backend → AIML)
1. Go to http://localhost:5173
2. Upload a resume
3. Backend sends to AIML for parsing
4. Results displayed in Frontend

### 2. Proctoring Analysis (Frontend → AIML)
1. Go to assessment page
2. Camera/audio captures frames
3. Frontend sends to AIML API
4. Real-time violation detection

### 3. API Testing with cURL

**Health Check:**
```bash
curl http://localhost:5000/api/health
curl http://localhost:3000/api/health
```

**Parse Resume:**
```bash
curl -X POST -F "file=@resume.pdf" http://localhost:5000/api/parse-resume
```

**Analyze Proctoring:**
```bash
curl -X POST -F "image=@frame.jpg" http://localhost:5000/api/analyze-proctor
```

---

## 📊 Project Structure

```
Interview Coding Assessment/
├── Frontend/                  # React 19 + Vite SPA
│   ├── src/
│   │   ├── pages/           # Route pages
│   │   ├── components/      # React components
│   │   └── lib/             # API client, utils
│   ├── package.json
│   └── vite.config.js
│
├── Backend/                   # Express + Node.js API
│   ├── src/
│   │   ├── routes/          # API endpoints
│   │   ├── models/          # Data models
│   │   └── middleware/      # Auth, validation
│   ├── package.json
│   └── .env                 # Environment config
│
├── AIML/                      # Python + Flask ML APIs
│   ├── scripts/             # ML scripts
│   │   ├── analyze_proctor.py
│   │   └── parse_resume.py
│   ├── main.py              # CLI entry point
│   ├── server.py            # Flask API
│   ├── run.py               # Dev runner
│   ├── requirements.txt
│   └── data/
│
└── docker-compose.yml       # Multi-service orchestration
```

---

## 🔧 Environment Configuration

### Backend `.env` (Backend/ folder)
```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/interview_assessment
JWT_SECRET=your_secret_key_change_in_production
AIML_API_URL=http://localhost:5000
SESSION_SECRET=your_session_secret
```

### AIML `.env` (AIML/ folder)
```env
FLASK_ENV=development
FLASK_DEBUG=True
SERVER_HOST=0.0.0.0
SERVER_PORT=5000
BACKEND_API_URL=http://localhost:3000
```

### Frontend `.env` (Frontend/ folder)
```env
VITE_API_BASE_URL=http://localhost:3000
VITE_AIML_API_URL=http://localhost:5000
```

---

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Windows
netstat -ano | findstr :5173
taskkill /PID <PID> /F

# Mac/Linux
lsof -i :5173
kill -9 <PID>
```

### Services Not Communicating
1. Check all services are running
2. Verify ports are correct
3. Check environment variables
4. Check CORS settings in Backend

### AIML Not Starting
```bash
# Check Python version
python --version  # Should be 3.8+

# Reinstall dependencies
pip install --upgrade -r requirements.txt

# Try with python3
python3 run.py
```

### MongoDB Connection Issues
```bash
# Check if MongoDB is running
mongod --version

# Test connection
mongo mongodb://localhost:27017
```

### Docker Issues
```bash
# Clean and restart
docker-compose down -v
docker-compose up --build

# Check container logs
docker-compose logs aiml
docker-compose logs backend
```

---

## 📝 Common Commands Reference

### Frontend
```bash
cd Frontend
npm install          # Install dependencies
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Build for production
npm run preview      # Preview production build
```

### Backend
```bash
cd Backend
npm install          # Install dependencies
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Build for production
npm test             # Run tests
npm run seed         # Seed database
```

### AIML
```bash
cd AIML
pip install -r requirements.txt    # Install dependencies
python run.py                       # Start server (http://localhost:5000)
python main.py analyze-proctor --image frame.jpg
python main.py parse-resume --input resume.pdf
```

### Docker
```bash
docker-compose up              # Start all services
docker-compose up -d           # Start in background
docker-compose down            # Stop all services
docker-compose logs -f         # View live logs
docker-compose ps              # List running containers
```

---

## ✅ Verification Checklist

- [ ] Frontend running on http://localhost:5173
- [ ] Backend running on http://localhost:3000
- [ ] AIML running on http://localhost:5000
- [ ] MongoDB connected
- [ ] Frontend can communicate with Backend
- [ ] Backend can communicate with AIML
- [ ] All environment variables set correctly
- [ ] No port conflicts

---

## 🚀 Next Steps

1. **Start all services** using preferred method above
2. **Login** to Frontend with test credentials
3. **Upload resume** to test AIML integration
4. **Start assessment** to test proctoring
5. **Check backend logs** to verify API calls
6. **Review results** on dashboard

---

## 📚 Additional Resources

- [Frontend README](./Frontend/README.md)
- [Backend README](./Backend/README.md)
- [AIML README](./AIML/README.md)
- [AIML Getting Started](./AIML/GETTING_STARTED.md)

---

## 💡 Tips

- Keep each service in a separate terminal for easier debugging
- Use `npm run dev` / `python run.py` to enable hot-reload
- Check error logs in terminal immediately if something breaks
- Use different ports if any port is already in use
- MongoDB can be local or Atlas cloud - update connection string accordingly

---

## 🆘 Need Help?

Check specific README files:
- Frontend: `Frontend/README.md`
- Backend: `Backend/README.md`
- AIML: `AIML/README.md` or `AIML/GETTING_STARTED.md`

Or review the detailed setup in each service folder!
