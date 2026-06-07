const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const PORT = 8766;

// 上传目录
const uploadDir = path.join(__dirname, 'uploads', 'ref-images');
fs.mkdirSync(uploadDir, { recursive: true });

// multer 配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const hash = crypto.randomBytes(8).toString('hex');
    cb(null, `${Date.now()}-${hash}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files allowed'));
  }
});

// 参考图上传接口
app.post('/api/upload-ref-image', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image provided' });
  const url = `/uploads/ref-images/${req.file.filename}`;
  res.json({ url, filename: req.file.filename });
});

// 图片代理下载接口（解决 CORS 跨域下载问题）
app.get('/api/proxy-image', async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) return res.status(400).json({ error: 'Missing url parameter' });

  try {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    if (!response.ok) return res.status(response.status).json({ error: 'Failed to fetch image' });

    const contentType = response.headers.get('content-type') || 'image/png';
    const buffer = Buffer.from(await response.arrayBuffer());

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    // 允许前端下载
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(buffer);
  } catch (e) {
    console.error('[proxy-image] Error:', e.message);
    res.status(500).json({ error: 'Proxy fetch failed' });
  }
});

// 视频代理下载接口（解决 CORS 跨域 + 大文件流式传输）
app.get('/api/proxy-video', async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) return res.status(400).json({ error: 'Missing url parameter' });

  try {
    const response = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    if (!response.ok) return res.status(response.status).json({ error: 'Failed to fetch video' });

    const contentType = response.headers.get('content-type') || 'video/mp4';
    const contentLength = response.headers.get('content-length');
    res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Stream the video
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (e) {
    console.error('[proxy-video] Error:', e.message);
    res.status(500).json({ error: 'Proxy fetch failed' });
  }
});

// 参考图删除接口
app.delete('/api/upload-ref-image/:filename', (req, res) => {
  const filepath = path.join(uploadDir, req.params.filename);
  // 安全检查：防止路径遍历
  if (!filepath.startsWith(uploadDir)) return res.status(403).json({ error: 'Forbidden' });
  fs.unlink(filepath, (err) => {
    if (err && err.code !== 'ENOENT') {
      return res.status(500).json({ error: 'Delete failed' });
    }
    res.json({ success: true });
  });
});

// 静态文件：上传的图片
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 静态文件：index.html 等
app.use(express.static(__dirname));

// SPA fallback（Express 5 要求命名参数）
app.get('{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ GPT Image 2 server running at http://localhost:${PORT}`);
});
