/**
 * keepAlive.js – v0.6.1
 *
 * Self-Healing Watchdog für den TGShopBot auf Render.com.
 *
 * ─── WARUM v0.6.0 NICHT AUSREICHTE ──────────────────────────────────────
 * Render.com Free Tier spinnt einen Dienst nach 15 Minuten ohne eingehenden
 * HTTP-Request herunter ("Cold Start"). Das Problem: Der Self-Ping des Bots
 * pingt seinen EIGENEN Endpunkt – aber wenn der Container bereits schläft,
 * kommt der Ping nicht mehr durch → der Dienst bleibt schlafen.
 *
 * Zusätzlich: Telegraf's Long Polling kann nach ~48h in einen "frozen" State
 * geraten. getMe() schlägt dabei NICHT fehl (Telegram API antwortet), aber
 * der Bot empfängt keine Updates mehr. Das alte Heartbeat-System bemerkt
 * das nicht, weil es nur die Telegram-Verbindung prüft, nicht ob Updates
 * wirklich ankommen.
 *
 * ─── LÖSUNG v0.6.1 – 4 Schutzmechanismen ────────────────────────────────
 *
 * 1. UPDATE-WATCHDOG: Jeder eingehende Telegram-Update setzt einen Timestamp
 *    (notifyUpdate wird von index.js aufgerufen). Wenn > UPDATE_TIMEOUT ms
 *    kein Update ankam UND der Bot > WARMUP_TIME läuft → Neustart.
 *    Das erkennt "silent polling death" zuverlässig.
 *
 * 2. TELEGRAM HEARTBEAT: Alle 60s wird getMe() aufgerufen.
 *    3x hintereinander fehlgeschlagen → process.exit(1).
 *
 * 3. SELF-PING alle 13 Minuten: Verhindert Render.com Cold Starts.
 *    13 Min gibt sicheren Puffer vor der 15-Min-Grenze.
 *    (UptimeRobot pingt alle 5 Min als externe Absicherung.)
 *
 * 4. SMART HEALTH Endpoint: Gibt 503 zurück wenn der Bot unresponsiv ist,
 *    damit UptimeRobot Alarm schlägt.
 */

const http = require('http');
const https = require('https');

// ─── KONFIGURATION ────────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL    = 60  * 1000;        // 60s  – Telegram API Check
const SELF_PING_INTERVAL    = 13  * 60 * 1000;   // 13min – Render Cold-Start Prevention
const UPDATE_CHECK_INTERVAL =  5  * 60 * 1000;   // 5min  – Polling-Death Check
const UPDATE_TIMEOUT        = 30  * 60 * 1000;   // 30min ohne Update → verdächtig
const WARMUP_TIME           = 10  * 60 * 1000;   // 10min Anlaufzeit vor Update-Checks
const MAX_FAILURES          = 3;                  // 3x Heartbeat fehlt → Neustart
const HEALTH_MAX_AGE        =  3  * 60 * 1000;   // 3min ohne Heartbeat → unhealthy

// ─── STATE ────────────────────────────────────────────────────────────────

let bot               = null;
let heartbeatTimer    = null;
let selfPingTimer     = null;
let updateCheckTimer  = null;
let failureCount      = 0;
let lastHeartbeat     = Date.now();
let lastUpdate        = Date.now(); // Wird von notifyUpdate() aktualisiert
let totalHeartbeats   = 0;
let totalRestarts     = 0;
const startTime       = Date.now();

// ─── UPDATE NOTIFIER (von index.js Middleware aufgerufen) ─────────────────

const notifyUpdate = () => {
    lastUpdate = Date.now();
};

// ─── UPDATE-WATCHDOG: Erkennt "silent polling death" ─────────────────────

const checkUpdates = () => {
    const uptime = Date.now() - startTime;
    if (uptime < WARMUP_TIME) return; // Anlaufzeit abwarten

    const timeSinceUpdate = Date.now() - lastUpdate;
    if (timeSinceUpdate > UPDATE_TIMEOUT) {
        console.error(
            `[KeepAlive] ⚠️  Seit ${Math.floor(timeSinceUpdate / 60000)}min kein Telegram-Update ` +
            `empfangen. Bot scheint eingefroren → Neustart wird eingeleitet.`
        );
        totalRestarts++;
        setTimeout(() => process.exit(1), 1000);
    }
};

// ─── HEARTBEAT: Telegram API Connectivity Check ───────────────────────────

const heartbeat = async () => {
    try {
        await bot.telegram.getMe();
        failureCount  = 0;
        lastHeartbeat = Date.now();
        totalHeartbeats++;
    } catch (error) {
        failureCount++;
        console.error(
            `[KeepAlive] Heartbeat fehlgeschlagen (${failureCount}/${MAX_FAILURES}): ${error.message}`
        );
        if (failureCount >= MAX_FAILURES) {
            console.error(
                `[KeepAlive] ⛔ ${MAX_FAILURES}x Heartbeat fehlgeschlagen → ` +
                `Prozess wird beendet für Container-Restart`
            );
            totalRestarts++;
            setTimeout(() => process.exit(1), 1000);
        }
    }
};

// ─── SELF-PING: Render.com Cold-Start Prevention ──────────────────────────

const selfPing = () => {
    const url = process.env.RENDER_EXTERNAL_URL || process.env.SELF_PING_URL;
    if (!url) return;

    const pingUrl = url.replace(/\/$/, '') + '/health';
    const client  = pingUrl.startsWith('https') ? https : http;

    const req = client.get(pingUrl, (res) => {
        res.resume(); // Response konsumieren → kein Memory Leak
    });
    req.on('error', () => { /* Self-Ping Fehler nicht kritisch */ });
    req.setTimeout(10000, () => req.destroy()); // 10s Timeout
};

// ─── SMART HEALTH ENDPOINT ────────────────────────────────────────────────

const getHealthStatus = () => {
    const now           = Date.now();
    const heartbeatAge  = now - lastHeartbeat;
    const updateAge     = now - lastUpdate;
    const isHealthy     = heartbeatAge < HEALTH_MAX_AGE;
    const uptimeSeconds = Math.floor((now - startTime) / 1000);

    return {
        healthy:       isHealthy,
        uptime:        formatUptime(uptimeSeconds),
        lastHeartbeat: `${Math.floor(heartbeatAge / 1000)}s ago`,
        lastUpdate:    `${Math.floor(updateAge / 1000)}s ago`,
        heartbeats:    totalHeartbeats,
        failures:      failureCount,
        restarts:      totalRestarts,
        status:        isHealthy ? 'Bot is running' : 'Bot may be unresponsive'
    };
};

const formatUptime = (totalSeconds) => {
    const days    = Math.floor(totalSeconds / 86400);
    const hours   = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (days  > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
};

// ─── HTTP SERVER ──────────────────────────────────────────────────────────

const createServer = (port) => {
    const server = http.createServer((req, res) => {
        if (req.url === '/health' || req.url === '/') {
            const status     = getHealthStatus();
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

// ─── START / STOP ─────────────────────────────────────────────────────────

const start = (botInstance) => {
    bot = botInstance;

    // Heartbeat starten
    heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL);
    heartbeat(); // Sofort einmal prüfen

    // Update-Watchdog starten
    updateCheckTimer = setInterval(checkUpdates, UPDATE_CHECK_INTERVAL);
    console.log(`[KeepAlive] Update-Watchdog aktiv (Timeout: ${UPDATE_TIMEOUT / 60000}min)`);

    // Self-Ping starten
    if (process.env.RENDER_EXTERNAL_URL || process.env.SELF_PING_URL) {
        selfPingTimer = setInterval(selfPing, SELF_PING_INTERVAL);
        selfPing(); // Sofort einmal pingen
        console.log(`[KeepAlive] Self-Ping aktiv (alle ${SELF_PING_INTERVAL / 60000}min)`);
    } else {
        console.log(`[KeepAlive] Self-Ping deaktiviert (kein RENDER_EXTERNAL_URL/SELF_PING_URL)`);
    }

    console.log(
        `[KeepAlive] Watchdog v0.6.1 gestartet ` +
        `(Heartbeat: ${HEARTBEAT_INTERVAL / 1000}s, ` +
        `UpdateTimeout: ${UPDATE_TIMEOUT / 60000}min, ` +
        `MaxFailures: ${MAX_FAILURES})`
    );
};

const stop = () => {
    if (heartbeatTimer)   clearInterval(heartbeatTimer);
    if (selfPingTimer)    clearInterval(selfPingTimer);
    if (updateCheckTimer) clearInterval(updateCheckTimer);
    console.log('[KeepAlive] Watchdog gestoppt.');
};

module.exports = {
    createServer,
    start,
    stop,
    notifyUpdate,
    getHealthStatus
};
