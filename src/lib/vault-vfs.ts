// ============================================
// Virtual File System for XXE Simulation
// When the XML parser encounters file:// URI,
// it reads from this virtual filesystem
// ============================================

import { DOT_ENV_CONTENT } from "./ctf-config";

export type VFSFile = {
  content: string;
  size: number;
  permissions: string;
  owner: string;
};

const virtualFileSystem: Record<string, VFSFile> = {
  "/app/.env": {
    content: DOT_ENV_CONTENT,
    size: DOT_ENV_CONTENT.length,
    permissions: "-rw-r-----",
    owner: "root:vault",
  },
  "/app/config.json": {
    content: JSON.stringify(
      {
        app: "VaultVM",
        version: "2.1.0",
        build: "20241215-prod",
        debug: false,
        maxUploadSize: "10MB",
        allowedFormats: ["svg", "png", "jpg", "gif"],
        trustedProxies: ["10.0.0.0/8", "172.16.0.0/12"],
        rateLimit: { windowMs: 900000, max: 100 },
        jwt: { algorithm: "HS256", expiresIn: "24h" },
        vault: {
          storagePath: "/var/lib/vault/backups",
          encryptionKey: "REDACTED",
          maxFileSize: "100MB",
        },
      },
      null,
      2
    ),
    size: 456,
    permissions: "-rw-r--r--",
    owner: "vault:vault",
  },
  "/app/package.json": {
    content: JSON.stringify(
      {
        name: "vaultvm-service",
        version: "2.1.0",
        description: "VaultVM SVG Avatar Processing Service",
        main: "dist/server.js",
        scripts: {
          start: "node dist/server.js",
          dev: "nodemon src/server.ts",
          build: "tsc && webpack",
          "db:migrate": "prisma migrate deploy",
          "db:seed": "prisma db seed",
        },
        dependencies: {
          express: "^4.18.2",
          prisma: "^5.7.0",
          jsonwebtoken: "^9.0.2",
          multer: "^1.4.5-lts.1",
          "node-svg-parser": "^1.0.0",
          nunjucks: "^3.2.4",
          sharp: "^0.33.1",
        },
      },
      null,
      2
    ),
    size: 523,
    permissions: "-rw-r--r--",
    owner: "vault:vault",
  },
  "/etc/hostname": {
    content: "vaultvm-prod-01\n",
    size: 17,
    permissions: "-rw-r--r--",
    owner: "root:root",
  },
  "/etc/passwd": {
    content:
      "root:x:0:0:root:/root:/bin/bash\n" +
      "daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\n" +
      "nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin\n" +
      "vault:x:1000:1000:VaultVM Service:/app:/bin/false\n" +
      "nginx:x:101:101:Nginx:/nonexistent:/bin/false\n",
    size: 212,
    permissions: "-rw-r--r--",
    owner: "root:root",
  },
  "/app/server.ts": {
    content: `import express from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { parseSVG } from './parsers/svg';
import { renderTemplate } from './engines/nunjucks';

const app = express();
const prisma = new PrismaClient();
const upload = multer({ dest: '/tmp/uploads/' });

// SVG Upload endpoint - processes SVG files for avatar
app.post('/api/upload', upload.single('avatar'), async (req, res) => {
  // WAF Gatekeeper checks raw content first
  // Then backend processes with unescape() ...
  // TODO: Fix security issue with unescape() - tracked as VULN-2024-0891
});

// Debug console (internal only) - uses Nunjucks template engine
app.post('/debug/console', async (req, res) => {
  // Requires APP_SECRET_KEY authentication
  // Template rendering with WAF protection
});

export default app;
`,
    size: 678,
    permissions: "-rw-r-----",
    owner: "vault:vault",
  },
};

export function vfsRead(path: string): VFSFile | null {
  // Normalize the path
  let normalized = path
    .replace("file:///", "/")
    .replace("file://", "/")
    .replace(/\/+/g, "/");

  // Remove trailing slash
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  return virtualFileSystem[normalized] || null;
}

export function vfsExists(path: string): boolean {
  return vfsRead(path) !== null;
}

export function vfsList(): string[] {
  return Object.keys(virtualFileSystem);
}
