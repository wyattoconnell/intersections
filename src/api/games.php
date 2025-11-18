<?php
declare(strict_types=1);

/**
 * games.php — minimal mysqli endpoint with helpers + CORS
 * - GET /api/games.php                -> list latest games (limit 200)
 * - GET /api/games.php?id=123         -> get one by id
 * - GET /api/games.php?game_date=YYYY-MM-DD -> list by date
 *
 * If you don’t pass query params it behaves like your original: “SELECT * FROM games”.
 */

/* ---------- (0) Optional CORS ---------- *
 * If your Angular app is on the SAME origin as this API, you can leave $ALLOWED_ORIGIN = null.
 * If it’s on a different origin (e.g., https://app.your-domain.com), set it below.
 */
$ALLOWED_ORIGINS = ['http://localhost:4200', 'https://intersections.in/#/'];

$origin = $_SERVER['HTTP_ORIGIN'] ?? null;
if ($origin && in_array($origin, $ALLOWED_ORIGINS, true)) {
  header('Access-Control-Allow-Origin: ' . $origin);
  header('Vary: Origin');
  header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
}
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

/* ---------- (1) Always JSON ---------- */
header('Content-Type: application/json');

/* ---------- (2) TEMP debug (turn off in prod) ---------- */
ini_set('display_errors', '1');
error_reporting(E_ALL);

/* ---------- (3) Helper functions ---------- */
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
function q(string $key, ?string $default = null): ?string {
  return isset($_GET[$key]) ? trim((string)$_GET[$key]) : $default;
}
function is_date_ymd(?string $s): bool {
  if (!$s) return false;
  $d = DateTime::createFromFormat('Y-m-d', $s);
  return $d && $d->format('Y-m-d') === $s;
}
function decode_json_or_raw($value) {
  $decoded = json_decode($value, true);
  return (json_last_error() === JSON_ERROR_NONE) ? $decoded : $value;
}

/* ---------- (4) DB config (move these to a secure include for prod) ---------- */
$host = 'localhost';
$db   = 'u816953022_intersect_db';             // full prefixed DB name
$user = 'u816953022_wyattmoconnell';           // full prefixed DB user
$pass = '25Jagra8';                          // rotate if exposed, keep out of repo

/* ---------- (5) mysqli connection ---------- */
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
try {
  $conn = new mysqli($host, $user, $pass, $db);
  $conn->set_charset('utf8mb4');
} catch (Throwable $e) {
  send_err('Database connection failed', 500);
}

/* ---------- (6) Routing: only GET for now (read-only) ---------- */
$method = $_SERVER['REQUEST_METHOD'];

try {
  if ($method !== 'GET') {
    send_err('Method not allowed', 405);
  }

  $id        = q('id');
  $game_date = q('game_date');

  if ($id !== null && $id !== '') {
    // GET by id
    $stmt = $conn->prepare("SELECT id, game_date, content, source FROM games WHERE id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $res = $stmt->get_result();
    $row = $res->fetch_assoc();
    if (!$row) send_err('Not found', 404);

    $row['content'] = decode_json_or_raw($row['content']);
    send_ok($row);
  }

  if ($game_date !== null && $game_date !== '') {
    // GET by game_date
    if (!is_date_ymd($game_date)) send_err('Invalid game_date (expected YYYY-MM-DD)', 400);
  
    // First try to get games for the requested date
    $stmt = $conn->prepare(
      "SELECT id, game_date, content, source
       FROM games
       WHERE game_date = ?
       ORDER BY id DESC"
    );
    $stmt->bind_param('s', $game_date);
    $stmt->execute();
    $res = $stmt->get_result();
  
    $rows = [];
    while ($r = $res->fetch_assoc()) {
      $r['content'] = decode_json_or_raw($r['content']);
      $rows[] = $r;
    }
  
    // If we found at least one game for that date, return them as before
    if (count($rows) > 0) {
      send_ok($rows); // same shape as your current response
    }
  
    // Otherwise, fall back to a random game from existing rows
    $stmt = $conn->prepare(
      "SELECT id, game_date, content, source
       FROM games
       ORDER BY RAND()
       LIMIT 1"
    );
    $stmt->execute();
    $res = $stmt->get_result();
    $row = $res->fetch_assoc();
  
    if (!$row) {
      // No rows at all in the DB
      send_err('No games in database', 404);
    }
  
    $row['content'] = decode_json_or_raw($row['content']);
  
    // Keep the same response shape as the normal /game_date (array of games)
    send_ok([$row]);
  }
  

  // Default: returns puzzle for that day
  date_default_timezone_set('America/Los_Angeles'); // pick your TZ
  $today = date('Y-m-d');

  // ?dates=1 -> return all game_date strings up to today, newest first
  $dates = q('dates');
  if ($dates !== null && $dates !== '') {
    $stmt = $conn->prepare("
      SELECT DISTINCT DATE_FORMAT(game_date, '%Y-%m-%d') AS game_date
      FROM games
      WHERE game_date <= ?
      ORDER BY game_date DESC
      LIMIT 365
    ");
    $stmt->bind_param('s', $today);
    $stmt->execute();
    $res = $stmt->get_result();

    $out = [];
    while ($r = $res->fetch_assoc()) { $out[] = $r['game_date']; }
    send_ok($out); // { data: ["2025-09-30","2025-09-29", ...] }
  }
  
  $stmt = $conn->prepare(
    "SELECT id, game_date, content, source
     FROM games
     WHERE game_date = ?
     LIMIT 1"
  );
  $stmt->bind_param('s', $today);
  $stmt->execute();
  $res = $stmt->get_result();
  $row = $res->fetch_assoc();
  
  if ($row) {
    $row['content'] = decode_json_or_raw($row['content']);
    send_ok($row);               // { data: { id, game_date, content, source } }
  } else {
    send_err('No game for today', 404);
  }

} catch (Throwable $e) {
  // Keep generic in prod; you can log $e->getMessage() server-side.
  send_err('Server error', 500);
} finally {
  if (isset($conn) && $conn instanceof mysqli) {
    $conn->close();
  }
}
