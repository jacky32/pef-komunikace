<?php
/**
 * leaderboard.php – Return the top 10 verified scores.
 *
 * Method : GET
 *
 * Response (200):
 * {
 *   "leaderboard": [
 *     {"rank": 1, "player_name": "...", "final_time": 12345, "created_at": "..."},
 *     ...
 *   ]
 * }
 */

declare(strict_types=1);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed. Use GET.']);
    exit;
}

require_once __DIR__ . '/db.php';

$db   = getDb();
$stmt = $db->query(
    'SELECT player_name,
            final_time,
            created_at
       FROM bron_game_instances
      WHERE is_verified = 1
        AND final_time IS NOT NULL
      ORDER BY final_time ASC
      LIMIT 10'
);

$rows        = $stmt->fetchAll();
$leaderboard = [];

foreach ($rows as $index => $row) {
    $leaderboard[] = [
        'rank'        => $index + 1,
        'player_name' => $row['player_name'] ?? 'Anonymous',
        'final_time'  => (int) $row['final_time'],
        'created_at'  => $row['created_at'],
    ];
}

echo json_encode(['leaderboard' => $leaderboard]);
