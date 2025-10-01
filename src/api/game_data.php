<?php
declare(strict_types=1);

/**
 * game_data.php — PlayState storage API (mysqli)
 *
 * Table assumed (in your existing DB `u816953022_intersect_db`):
 *   CREATE TABLE IF NOT EXISTS `game_data` (
 *     `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
 *     `user_key`      VARCHAR(128) NOT NULL,
 *     `game_date`     DATE NOT NULL,
 *     `state`         JSON NOT NULL,
 *     `started_at`    DATETIME NULL,
 *     `last_saved_at` DATETIME NULL,
 *     `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 *     `updated_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 *     PRIMARY KEY (`id`),
 *     UNIQUE KEY `uniq_user_day` (`user_key`,`game_date`),
 *     KEY `idx_game_date` (`game_date`),
 *     KEY `idx_last_saved` (`last_saved_at`),
 *     CHECK (JSON_VALID(`state`))
 *   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
 */

/* --------- (0) CORS (allow localhost dev + prod) --------- */
$ALLOWED_ORIGINS = ['http://localhost:4200', 'https://intersections.in']; // add your prod origin
$origin = $_SERVER['HTTP_ORIGIN'] ?? null;
if ($origin && in_array($origin, $ALLOWED_ORIGINS, true)) {
  header('Access-Control-Allow-Origin: ' . $origin);
  header('Vary: Origin');
  header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS'); // OK to list PUT even if blocked by WAF
  header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-HTTP-Method-Override');
  // If you ever send cookies: header('Access-Control-Allow-Credentials: true');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

/* --------- (1) Always JSON --------- */
header('Content-Type: application/json');

/* --------- (2) TEMP debug (disable in prod) --------- */
ini_set('display_errors', '1');
error_reporting(E_ALL);

/* --------- (3) Helpers --------- */
function send_ok($payload, int $code = 200): void {
  http_response_code($code);
  echo json_encode(['data' => $payload], JSON_UNESCAPED_UNICODE);
  exit;
}
function send_err(string $msg, int $code): void {
  http_response_code($code);
  echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE);
  exit;
}
function read_json_body(): array {
  $raw = file_get_contents('php://input');
  if ($raw === false || $raw === '') return [];
  $d = json_decode($raw, true);
  if (json_last_error() !== JSON_ERROR_NONE) {
    send_err('Invalid JSON body', 400);
  }
  return $d;
}
function q(string $key, ?string $default = null): ?string {
  return isset($_GET[$key]) ? trim((string)$_GET[$key]) : $default;
}
function is_date_ymd(?string $s): bool {
  if (!$s) return false;
  $d = DateTime::createFromFormat('Y-m-d', $s);
  return $d && $d->format('Y-m-d') === $s;
}

/* --------- (4) DB config --------- */
$host = 'localhost';
$db   = 'u816953022_intersect_db';   // <-- your DB
$user = 'u816953022_wyattmoconnell'; // <-- your DB user
$pass = '25Jagra8';                // <-- your DB pass

/* --------- (5) Connect --------- */
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
try {
  $conn = new mysqli($host, $user, $pass, $db);
  $conn->set_charset('utf8mb4');
} catch (Throwable $e) {
  send_err('Database connection failed', 500);
}

/* --------- (6) Routing --------- */
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$override = $_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'] ?? ($_GET['_method'] ?? null);
if ($method === 'POST' && strtoupper((string)$override) === 'PUT') {
  $method = 'PUT';
}

try {
  if ($method === 'GET') {
    // GET /api/game_data.php?user_key=...&game_date=YYYY-MM-DD
    $user_key  = q('user_key');
    $game_date = q('game_date');

    if (!$user_key) send_err('user_key is required', 400);
    if (!$game_date || !is_date_ymd($game_date)) send_err('Valid game_date (YYYY-MM-DD) is required', 400);

    $stmt = $conn->prepare("SELECT id, user_key, game_date, state, started_at, last_saved_at, created_at, updated_at
                            FROM game_data
                            WHERE user_key = ? AND game_date = ?
                            LIMIT 1");
    $stmt->bind_param('ss', $user_key, $game_date);
    $stmt->execute();
    $res = $stmt->get_result();
    $row = $res->fetch_assoc();

    if (!$row) send_ok(null, 200); // not found -> return null (or send_err('Not found',404) if you prefer)
    // decode state JSON to real object
    $decoded = json_decode($row['state'], true);
    $row['state'] = (json_last_error() === JSON_ERROR_NONE) ? $decoded : $row['state'];

    send_ok($row, 200);
  }

  if ($method === 'PUT') {
    // Body: { user_key, game_date, state, started_at?, last_saved_at? }
    $body = read_json_body();

    $user_key  = $body['user_key']  ?? null;
    $game_date = $body['game_date'] ?? null;
    $state     = $body['state']     ?? null;
    $started_at    = $body['started_at']    ?? null; // 'YYYY-MM-DD HH:MM:SS' (optional)
    $last_saved_at = $body['last_saved_at'] ?? null;

    if (!$user_key || !is_string($user_key)) send_err('user_key is required', 400);
    if (!$game_date || !is_date_ymd($game_date)) send_err('Valid game_date (YYYY-MM-DD) is required', 400);
    if (!is_array($state) && !is_object($state)) send_err('state must be an object', 400);

    $stateJson = json_encode($state, JSON_UNESCAPED_UNICODE);

    // Upsert by (user_key, game_date)
    $sql = "INSERT INTO game_data (user_key, game_date, state, started_at, last_saved_at)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              state = VALUES(state),
              started_at = COALESCE(VALUES(started_at), started_at),
              last_saved_at = VALUES(last_saved_at),
              updated_at = CURRENT_TIMESTAMP";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param('sssss', $user_key, $game_date, $stateJson, $started_at, $last_saved_at);
    $stmt->execute();

    // Return the saved row
    $stmt = $conn->prepare("SELECT id, user_key, game_date, state, started_at, last_saved_at, created_at, updated_at
                            FROM game_data
                            WHERE user_key = ? AND game_date = ?
                            LIMIT 1");
    $stmt->bind_param('ss', $user_key, $game_date);
    $stmt->execute();
    $res = $stmt->get_result();
    $row = $res->fetch_assoc();
    if ($row) {
      $decoded = json_decode($row['state'], true);
      $row['state'] = (json_last_error() === JSON_ERROR_NONE) ? $decoded : $row['state'];
    }
    send_ok($row ?? true, $row ? 200 : 201);
  }

  // Methods not supported
  send_err('Method not allowed', 405);

} catch (Throwable $e) {
  // log $e->getMessage() server-side if desired
  send_err('Server error', 500);
} finally {
  if (isset($conn) && $conn instanceof mysqli) $conn->close();
}


