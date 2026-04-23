<?php

/**
 * Shared database connection for Komunikační Spojovatel PEF.
 * Returns a PDO instance connected to the MySQL database.
 */

define('DB_HOST', 'XXX');
define('DB_NAME', 'XXX');
define('DB_USER', 'XXX');
define('DB_PASS', 'XXX');

/**
 * Returns a PDO connection. Exits with a JSON error response on failure.
 *
 * @return PDO
 */
function getDb(): PDO
{
    static $pdo = null;

    if ($pdo !== null) {
        return $pdo;
    }

    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=utf8mb4',
        DB_HOST,
        DB_NAME
    );

    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];

    try {
        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
    } catch (PDOException $e) {
        http_response_code(503);
        header('Content-Type: application/json');
        echo json_encode([
            'error'   => 'Database connection failed.',
            'details' => $e->getMessage(),
        ]);
        exit;
    }

    return $pdo;
}
