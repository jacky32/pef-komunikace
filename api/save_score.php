<?php
/**
 * save_score.php – Record a player's verified completion time.
 *
 * Method : POST
 * Body   : JSON or form-encoded
 *   instance_id       string  – the ID returned by init_game.php
 *   final_time        int     – elapsed time in milliseconds
 *   player_name       string  – display name (max 50 chars)
 *   verification_hash string  – sha256(instance_id . final_time . 'PEF_SECRET_2024')
 *
 * Response (200):
 *   {"status":"success","position":N}
 *
 * Error responses use appropriate HTTP status codes.
 */

declare(strict_types=1);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed. Use POST.']);
    exit;
}

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/profanity.php';

const HASH_SALT = 'PEF_SECRET_2024';
// Allow ±5 seconds between the server-side elapsed time and the client claim
const TIME_TOLERANCE_MS = 5000;

// ---------------------------------------------------------------------------
// Parse input (JSON body or form POST)
// ---------------------------------------------------------------------------

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    $input = $_POST;
}

function requireParam(array $input, string $key): string
{
    if (!isset($input[$key]) || (string) $input[$key] === '') {
        http_response_code(400);
        echo json_encode(['error' => "Missing required parameter: {$key}."]);
        exit;
    }
    return (string) $input[$key];
}

$instanceId       = requireParam($input, 'instance_id');
$finalTimeRaw     = requireParam($input, 'final_time');
$playerName       = requireParam($input, 'player_name');
$verificationHash = requireParam($input, 'verification_hash');

// Validate final_time is a non-negative integer
if (!ctype_digit($finalTimeRaw) || (int) $finalTimeRaw < 0) {
    http_response_code(400);
    echo json_encode(['error' => 'final_time must be a non-negative integer (milliseconds).']);
    exit;
}
$finalTime = (int) $finalTimeRaw;

// Validate player_name length
if (mb_strlen($playerName, 'UTF-8') > 50) {
    http_response_code(400);
    echo json_encode(['error' => 'player_name must be 50 characters or fewer.']);
    exit;
}

// ---------------------------------------------------------------------------
// Look up instance
// ---------------------------------------------------------------------------

$db   = getDb();
$stmt = $db->prepare(
    'SELECT instance_id, is_verified,
            TIMESTAMPDIFF(SECOND, created_at, NOW()) AS elapsed_sec
       FROM bron_game_instances WHERE instance_id = :id LIMIT 1'
);
$stmt->execute([':id' => $instanceId]);
$row = $stmt->fetch();

if (!$row) {
    http_response_code(404);
    echo json_encode(['error' => 'Game instance not found.']);
    exit;
}

if ((int) $row['is_verified'] === 1) {
    http_response_code(409);
    echo json_encode(['error' => 'Score has already been submitted for this instance.']);
    exit;
}

// ---------------------------------------------------------------------------
// Verify timing (MySQL computes elapsed to avoid PHP/MySQL timezone mismatch)
// ---------------------------------------------------------------------------

$elapsedMs    = (int) $row['elapsed_sec'] * 1000;
$timeDelta    = abs($elapsedMs - $finalTime);

if ($timeDelta > TIME_TOLERANCE_MS) {
    http_response_code(400);
    echo json_encode([
        'error'        => 'Time verification failed: claimed time deviates too far from server time.',
        'server_elapsed_ms' => $elapsedMs,
        'claimed_ms'        => $finalTime,
        'delta_ms'          => $timeDelta,
    ]);
    exit;
}

// ---------------------------------------------------------------------------
// Verify hash
// ---------------------------------------------------------------------------

$expectedHash = hash('sha256', $instanceId . $finalTime . HASH_SALT);

if (!hash_equals($expectedHash, strtolower($verificationHash))) {
    http_response_code(400);
    echo json_encode(['error' => 'Verification hash mismatch.']);
    exit;
}

// ---------------------------------------------------------------------------
// Profanity filter
// ---------------------------------------------------------------------------

$playerName = sanitizeName($playerName);

// ---------------------------------------------------------------------------
// Persist score
// ---------------------------------------------------------------------------

$update = $db->prepare(
    'UPDATE bron_game_instances
        SET player_name = :name,
            final_time  = :time,
            is_verified = 1
      WHERE instance_id = :id'
);
$update->execute([
    ':name' => $playerName,
    ':time' => $finalTime,
    ':id'   => $instanceId,
]);

// ---------------------------------------------------------------------------
// Determine leaderboard position
// ---------------------------------------------------------------------------

$rank = $db->prepare(
    'SELECT COUNT(*) + 1 AS position
       FROM bron_game_instances
      WHERE is_verified = 1
        AND final_time < :time'
);
$rank->execute([':time' => $finalTime]);
$position = (int) $rank->fetchColumn();

echo json_encode([
    'status'   => 'success',
    'position' => $position,
]);
