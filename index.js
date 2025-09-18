const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '2mb' }));

const API_KEY = process.env.API_KEY || '';

function runCmd(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (err) return reject({ err, stdout, stderr });
      resolve({ stdout, stderr });
    });
  });
}

function findBinary(dir) {
  if (!fs.existsSync(dir)) return null;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    const list = fs.readdirSync(cur);
    for (const name of list) {
      const p = path.join(cur, name);
      const s = fs.statSync(p);
      if (s.isDirectory()) stack.push(p);
      else {
        if (name.endsWith('.bin') || name.endsWith('.hex')) return p;
      }
    }
  }
  return null;
}

app.get('/', (req, res) => res.send('✅ Arduino Compiler API is running'));

app.post('/compile', async (req, res) => {
  try {
    if (API_KEY) {
      const key = req.header('x-api-key') || '';
      if (key !== API_KEY) return res.status(401).json({ error: 'invalid api key' });
    }

    const { code, board, libraries } = req.body;
    if (!code || !board) return res.status(400).json({ error: 'code and board required' });

    const id = uuidv4();
    const sketchBase = `sketch_${id}`;
    const sketchDir = path.join('/tmp', sketchBase);
    fs.mkdirSync(sketchDir, { recursive: true });

    const inoPath = path.join(sketchDir, `${sketchBase}.ino`);
    fs.writeFileSync(inoPath, code);

    // install libs if provided
    if (Array.isArray(libraries) && libraries.length) {
      for (const lib of libraries) {
        await runCmd(`arduino-cli lib install "${lib}"`);
      }
    }

    const buildDir = path.join('/tmp', 'build', id);
    fs.mkdirSync(buildDir, { recursive: true });

    await runCmd(`arduino-cli compile --fqbn ${board} ${sketchDir} --output-dir ${buildDir}`);

    const binPath = findBinary(buildDir);
    if (!binPath) {
      return res.status(500).json({ error: 'no binary produced', buildDir });
    }

    const data = fs.readFileSync(binPath);
    const b64 = data.toString('base64');

    // cleanup
    try { fs.rmSync(sketchDir, { recursive: true, force: true }); } catch(e){}
    try { fs.rmSync(buildDir, { recursive: true, force: true }); } catch(e){}

    res.json({ filename: path.basename(binPath), binary: b64 });
  } catch (e) {
    console.error('compile error', e);
    const out = (e.stderr && e.stderr.toString()) || (e.stdout && e.stdout.toString()) || (e.err && e.err.message) || e.message;
    res.status(500).json({ error: 'compilation_failed', details: out });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening on ${port}`));
