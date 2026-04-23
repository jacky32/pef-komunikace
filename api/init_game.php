<?php
/**
 * init_game.php – Initialise a new game instance.
 *
 * Method : GET or POST
 * Params : player_name (optional)
 *
 * Response (200):
 * {
 *   "instance_id": "...",
 *   "layout": [[{"type":"...","rotation":N}, ...], ...],   // 5x5 grid, row-major
 *   "start": [0, 0],
 *   "goal":  [4, 4]
 * }
 */

declare(strict_types=1);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/profanity.php';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GRID_SIZE  = 10;
const TILE_TYPES = ['straight', 'elbow', 'cross'];

// Direction vectors: N, E, S, W
const DIR_DELTA = [
    'N' => [-1,  0],
    'E' => [ 0,  1],
    'S' => [ 1,  0],
    'W' => [ 0, -1],
];

// Opposite direction map
const DIR_OPPOSITE = ['N' => 'S', 'S' => 'N', 'E' => 'W', 'W' => 'E'];

// ---------------------------------------------------------------------------
// Path generation – random walk from [0,0] to [4,4]
// ---------------------------------------------------------------------------

/**
 * Generates a random path (array of [row,col] pairs) from [0,0] to [4,4].
 * Uses a DFS with randomised direction order; backtracks when stuck.
 * Guarantees a valid simple path (no repeated cells).
 *
 * @return array<int, array{int,int}>
 */
function generatePath(): array
{
    $goal = [GRID_SIZE - 1, GRID_SIZE - 1];

    // We try many times to get a diverse path; give up after a sensible limit.
    for ($attempt = 0; $attempt < 200; $attempt++) {
        $path    = [[0, 0]];
        $visited = [[0, 0]];

        if (dfsWalk($path, $visited, $goal)) {
            return $path;
        }
    }

    // Fallback: diagonal path along the first column then bottom row.
    return fallbackPath();
}

/**
 * Recursive DFS walk. Modifies $path and $visited in place.
 *
 * @param array $path    Reference to current path (array of [row,col])
 * @param array $visited Reference to visited cells set (array of [row,col])
 * @param array $goal    [row, col] of goal cell
 * @return bool          True if goal was reached from current head of $path
 */
function dfsWalk(array &$path, array &$visited, array $goal): bool
{
    $current = end($path);

    if ($current[0] === $goal[0] && $current[1] === $goal[1]) {
        return true;
    }

    // Bias: prefer directions that reduce Manhattan distance
    $dirs = ['N', 'E', 'S', 'W'];
    shuffle($dirs);

    // Sort with a weak bias toward goal; shuffle already provides randomness
    usort($dirs, function (string $a, string $b) use ($current, $goal): int {
        [$dra, $dca] = DIR_DELTA[$a];
        [$drb, $dcb] = DIR_DELTA[$b];
        $distA = abs(($current[0] + $dra) - $goal[0]) + abs(($current[1] + $dca) - $goal[1]);
        $distB = abs(($current[0] + $drb) - $goal[0]) + abs(($current[1] + $dcb) - $goal[1]);
        return $distA <=> $distB;
    });

    foreach ($dirs as $dir) {
        [$dr, $dc] = DIR_DELTA[$dir];
        $nr = $current[0] + $dr;
        $nc = $current[1] + $dc;

        if ($nr < 0 || $nr >= GRID_SIZE || $nc < 0 || $nc >= GRID_SIZE) {
            continue;
        }

        if (cellVisited($visited, $nr, $nc)) {
            continue;
        }

        $visited[] = [$nr, $nc];
        $path[]    = [$nr, $nc];

        if (dfsWalk($path, $visited, $goal)) {
            return true;
        }

        // Backtrack
        array_pop($path);
        array_pop($visited);
    }

    return false;
}

function cellVisited(array $visited, int $r, int $c): bool
{
    foreach ($visited as [$vr, $vc]) {
        if ($vr === $r && $vc === $c) {
            return true;
        }
    }
    return false;
}

function fallbackPath(): array
{
    $path = [];
    for ($r = 0; $r < GRID_SIZE; $r++) {
        $path[] = [$r, 0];
    }
    for ($c = 1; $c < GRID_SIZE; $c++) {
        $path[] = [GRID_SIZE - 1, $c];
    }
    return $path;
}

// ---------------------------------------------------------------------------
// Tile type + rotation determination
// ---------------------------------------------------------------------------

/**
 * Given a set of open port directions for a path cell, return [type, rotation].
 *
 * Ports is an array of direction strings from {'N','E','S','W'}.
 *
 * @param  array<string> $ports
 * @return array{string, int}  [type, correctRotation]
 */
function tileForPorts(array $ports): array
{
    $count = count($ports);
    sort($ports); // canonical order for comparison

    if ($count >= 3) {
        // cross – any rotation is fine; use 0
        return ['cross', 0];
    }

    if ($count === 2) {
        $key = implode('+', $ports); // already sorted

        // straight: opposite directions
        if ($key === 'N+S') return ['straight', 0];
        if ($key === 'E+W') return ['straight', 1];

        // elbow: perpendicular pairs
        // Sorted alphabetically: E+N, E+S, N+W, S+W
        if ($key === 'E+N') return ['elbow', 0]; // N+E sorted
        if ($key === 'E+S') return ['elbow', 1];
        if ($key === 'S+W') return ['elbow', 2];
        if ($key === 'N+W') return ['elbow', 3]; // W+N sorted
    }

    // 1 port (start / end cell) – use elbow pointing toward the single connection
    // Add a dummy second port so it still looks like an elbow visually.
    if ($count === 1) {
        $p = $ports[0];
        // Pick the elbow rotation whose first port matches; second port is "outward"
        $elbowMap = [
            'N' => 3,  // W+N
            'E' => 0,  // N+E
            'S' => 1,  // E+S
            'W' => 2,  // S+W
        ];
        return ['elbow', $elbowMap[$p] ?? 0];
    }

    // Fallback
    return ['cross', 0];
}

// ---------------------------------------------------------------------------
// Grid construction
// ---------------------------------------------------------------------------

/**
 * Build the 5x5 grid given the solution path.
 * Each cell gets a type and its CORRECT rotation; the correct rotation is then
 * randomly offset before being stored (so the player must solve the puzzle).
 *
 * @param array $path Array of [row,col] pairs forming the solution path
 * @return array 5x5 grid of ['type'=>string, 'rotation'=>int, 'correct_rotation'=>int]
 */
function buildGrid(array $path): array
{
    // Map path positions to their index in the path array for fast lookup
    $pathIndex = [];
    foreach ($path as $i => [$r, $c]) {
        $pathIndex[$r][$c] = $i;
    }

    // For each path cell, collect the directions of adjacent path cells
    $pathPorts = []; // [row][col] => string[]
    $n         = count($path);
    for ($i = 0; $i < $n; $i++) {
        [$r, $c] = $path[$i];
        $ports   = [];

        foreach (DIR_DELTA as $dir => [$dr, $dc]) {
            $nr = $r + $dr;
            $nc = $c + $dc;
            if (isset($pathIndex[$nr][$nc])) {
                $ni = $pathIndex[$nr][$nc];
                // Only connect to previous and next in path (avoid creating
                // unintended cross connections when the path visits nearby cells)
                if ($ni === $i - 1 || $ni === $i + 1) {
                    $ports[] = $dir;
                }
            }
        }

        $pathPorts[$r][$c] = $ports;
    }

    // Build the grid
    $grid = [];
    for ($r = 0; $r < GRID_SIZE; $r++) {
        $row = [];
        for ($c = 0; $c < GRID_SIZE; $c++) {
            // Start and goal are always fully open in all directions
            $isEndpoint = ($r === 0 && $c === 0)
                       || ($r === GRID_SIZE - 1 && $c === GRID_SIZE - 1);

            if ($isEndpoint) {
                $type     = 'cross';
                $rotation = 0;
            } else {
                if (isset($pathIndex[$r][$c])) {
                    $ports                    = $pathPorts[$r][$c];
                    [$type, $correctRotation] = tileForPorts($ports);
                } else {
                    $type           = TILE_TYPES[array_rand(TILE_TYPES)];
                    $correctRotation = random_int(0, 3);
                }
                $offset   = random_int(0, 3);
                $rotation = ($correctRotation + $offset) % 4;
            }

            $row[] = [
                'type'     => $type,
                'rotation' => $rotation,
            ];
        }
        $grid[] = $row;
    }

    return $grid;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// Read player_name from GET or POST
$input      = json_decode(file_get_contents('php://input'), true) ?? [];
$playerName = trim(
    $_POST['player_name']
    ?? $_GET['player_name']
    ?? $input['player_name']
    ?? ''
);

if ($playerName !== '') {
    // Validate length
    if (mb_strlen($playerName, 'UTF-8') > 50) {
        http_response_code(400);
        echo json_encode(['error' => 'player_name must be 50 characters or fewer.']);
        exit;
    }
    $playerName = sanitizeName($playerName);
}

// Generate puzzle
$path       = generatePath();
$grid       = buildGrid($path);
$instanceId = bin2hex(random_bytes(16));

// Persist to DB
$db  = getDb();
$sql = 'INSERT INTO bron_game_instances (instance_id, layout_json, created_at, player_name)
        VALUES (:instance_id, :layout_json, NOW(), :player_name)';
$stmt = $db->prepare($sql);
$stmt->execute([
    ':instance_id' => $instanceId,
    ':layout_json' => json_encode($grid),
    ':player_name' => $playerName !== '' ? $playerName : null,
]);

// Return response (do NOT expose correct_rotation to client)
$publicGrid = $grid; // already stripped of correct_rotation above

echo json_encode([
    'instance_id' => $instanceId,
    'layout'      => $publicGrid,
    'start'       => [0, 0],
    'goal'        => [GRID_SIZE - 1, GRID_SIZE - 1],
]);
