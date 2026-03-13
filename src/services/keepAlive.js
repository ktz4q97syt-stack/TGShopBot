/**
 * keepAlive.js – v0.5.68
 * 
 * Self-Healing Watchdog für den TGShopBot auf Render.com.
 * 
 * Problem: Telegraf's Long Polling kann stillschweigend sterben.
 * Der Prozess läuft weiter, HTTP antwortet 200, aber der Bot
 * empfängt keine Telegram-Updates mehr ("silent polling death").
 * UptimeRobot bemerkt das NICHT, weil der HTTP-Server noch lebt.
 * 
 * Lösung – 3 Schutzmechanismen:
 * ─────────────────────────────────────────────────────
 * 1. HEARTBEAT: Alle 60s wird bot.telegram.getMe() aufgerufen.
 *    Wenn das 3x hintereinander fehlschlägt → process.exit(1).
 *    Render.com startet den Container automatisch neu.
 *    (Polling in-process neu starten ist bei Telegraf buggy,
 *     deshalb sauberer Neustart über Container-Restart.)
 * 
 * 2. SELF-PING: Alle 4 Minuten pingt der Bot seinen eigenen
 *    HTTP-Endpunkt. Das verhindert Render.com Cold Starts
 *    unabhängig von UptimeRobot.
 * 
 * 3. SMART HEALTH: Der /health Endpunkt meldet den echten
 *    Bot-Status (letzte Heartbeat-Zeit, Uptime, Fehlercount).
 *    Nur wenn der letzte Heartbeat < 3 Minuten her ist → 200.
 *    Sonst → 503, damit UptimeRobot Alarm schlägt.
 */

const http = require('http');
const https = require('https');

// ─── KONFIGURATION ───────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL = 60 * 1000;        // 60 Sekunden
const SELF_PING_INTERVAL = 4 * 60 * 1000;    // 4 Minuten
const MAX_FAILURES = 3;                        // 3 Fehlschläge → Neustart
const HEALTH_MAX_AGE = 3 * 60 * 1000;        // 3 Min ohne Heartbeat → unhealthy

// ─── STATE ───────────────────────────────────────────────────────────────

let bot = null;
let heartbeatTimer = null;
let selfPingTimer = null;
let failureCount = 0;
let lastHeartbeat = Date.now();
let totalHeartbeats = 0;
let totalRestarts = 0;
const startTime = Date.now();

// ─── HEARTBEAT: Telegram API Connectivity Check ──────────────────────────

const heartbeat = async () => {
    try {
        await bot.telegram.getMe();
        failureCount = 0;
        lastHeartbeat = Date.now();
        totalHeartbeats++;
    } catch (error) {
        failureCount++;
        console.error(`[KeepAlive] Heartbeat fehlgeschlagen (${failureCount}/${MAX_FAILURES}): ${error.message}`);

        if (failureCount >= MAX_FAILURES) {
            console.error(`[KeepAlive] ⛔ ${MAX_FAILURES}x Heartbeat fehlgeschlagen → Prozess wird beendet für Container-Restart`);
            // Kurze Verzögerung damit der Log noch geschrieben wird
            setTimeout(() => process.exit(1), 1000);
        }
    }
};

// ─── SELF-PING: Render.com Cold Start Prevention ────────────────────────

const selfPing = () => {
    const url = process.env.RENDER_EXTERNAL_URL || process.env.SELF_PING_URL;
    if (!url) return; // Kein URL konfiguriert → skip

    const pingUrl = url.replace(/\/$/, '') + '/health';
    const client = pingUrl.startsWith('https') ? https : http;

    client.get(pingUrl, (res) => {
        // Response konsumieren damit kein Memory Leak entsteht
        res.resume();
    }).on('error', () => {
        // Self-Ping Fehler sind nicht kritisch, nur loggen
    });
};

// ─── SMART HEALTH ENDPOINT ───────────────────────────────────────────────

const getHealthStatus = () => {
    const now = Date.now();
    const heartbeatAge = now - lastHeartbeat;
    const isHealthy = heartbeatAge < HEALTH_MAX_AGE;
    const uptimeSeconds = Math.floor((now - startTime) / 1000);

    return {
        healthy: isHealthy,
        uptime: formatUptime(uptimeSeconds),
        lastHeartbeat: `${Math.floor(heartbeatAge / 1000)}s ago`,
        heartbeats: totalHeartbeats,
        failures: failureCount,
        status: isHealthy ? 'Bot is running' : 'Bot may be unresponsive'
    };
};

const formatUptime = (totalSeconds) => {
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
};

// ─── HTTP SERVER mit Smart Health ────────────────────────────────────────

const createServer = (port) => {
    const server = http.createServer((req, res) => {
        if (req.url === '/health' || req.url === '/') {
            const status = getHealthStatus();
            const statusCode = status.healthy ? 200 : 503;

            res.writeHead(statusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(status));
        } else {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('OK');
        }
    });

    server.listen(port, '0.0.0.0', () => {
        console.log(`[KeepAlive] Health-Server auf Port ${port}`);
    });

    return server;
};

// ─── START / STOP ────────────────────────────────────────────────────────

const start = (botInstance) => {
    bot = botInstance;

    // Heartbeat starten
    heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL);
    // Erster Heartbeat sofort
    heartbeat();

    // Self-Ping starten (nur wenn URL verfügbar)
    if (process.env.RENDER_EXTERNAL_URL || process.env.SELF_PING_URL) {
        selfPingTimer = setInterval(selfPing, SELF_PING_INTERVAL);
        console.log(`[KeepAlive] Self-Ping aktiv (alle ${SELF_PING_INTERVAL / 1000}s)`);
    } else {
        console.log(`[KeepAlive] Self-Ping deaktiviert (kein RENDER_EXTERNAL_URL/SELF_PING_URL)`);
    }

    console.log(`[KeepAlive] Watchdog gestartet (Heartbeat: ${HEARTBEAT_INTERVAL / 1000}s, Max-Failures: ${MAX_FAILURES})`);
};

const stop = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (selfPingTimer) clearInterval(selfPingTimer);
    console.log('[KeepAlive] Watchdog gestoppt.');
};

module.exports = {
    createServer,
    start,
    stop,
    getHealthStatus
};
