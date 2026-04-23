<?php
/**
 * Profanity filter — loads word lists from GitHub, caches locally.
 * Comparison is done on diacritic-stripped, lowercased text.
 *
 * Public API:
 *   filterProfanity(string $name): bool   – true if $name contains a banned word
 *   sanitizeName(string $name):   string  – replaces banned words with asterisks
 */

declare(strict_types=1);

const PROFANITY_CACHE_FILE = '/tmp/pef_badwords_cache.json';
const PROFANITY_CACHE_TTL  = 86400; // 24 h
const PROFANITY_URLS = [
    'https://raw.githubusercontent.com/LDNOOBWV2/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words_V2/main/data/cs.txt',
    'https://raw.githubusercontent.com/LDNOOBWV2/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words_V2/main/data/en.txt',
];

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/** Explicit diacritic → ASCII map (locale-independent). */
const DIACRITIC_MAP = [
    'á'=>'a','č'=>'c','ď'=>'d','é'=>'e','ě'=>'e','í'=>'i','ň'=>'n',
    'ó'=>'o','ř'=>'r','š'=>'s','ť'=>'t','ú'=>'u','ů'=>'u','ý'=>'y','ž'=>'z',
    'à'=>'a','â'=>'a','ã'=>'a','ä'=>'a','å'=>'a','æ'=>'ae','ç'=>'c',
    'è'=>'e','ê'=>'e','ë'=>'e','î'=>'i','ï'=>'i','ð'=>'d','ñ'=>'n',
    'ô'=>'o','õ'=>'o','ö'=>'o','ø'=>'o','ù'=>'u','û'=>'u','ü'=>'u',
    'ý'=>'y','þ'=>'th','ÿ'=>'y','ß'=>'ss','ľ'=>'l','ĺ'=>'l','ŕ'=>'r',
];

/**
 * Lowercases and strips diacritics.
 * Uses an explicit map instead of iconv//TRANSLIT (which is locale-dependent).
 */
function normalizeText(string $text): string
{
    $lower = mb_strtolower($text, 'UTF-8');
    return strtr($lower, DIACRITIC_MAP);
}

// ---------------------------------------------------------------------------
// Word list loading with file cache
// ---------------------------------------------------------------------------

function fetchWordListFromUrls(): array
{
    $words = [];
    $ctx   = stream_context_create(['http' => ['timeout' => 5, 'ignore_errors' => true]]);

    foreach (PROFANITY_URLS as $url) {
        $body = @file_get_contents($url, false, $ctx);
        if ($body === false || trim($body) === '') {
            continue;
        }
        foreach (explode("\n", $body) as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#') {
                continue;
            }
            $words[] = mb_strtolower($line, 'UTF-8');
        }
    }

    return $words;
}

function loadBannedWords(): array
{
    if (file_exists(PROFANITY_CACHE_FILE)) {
        $raw = @file_get_contents(PROFANITY_CACHE_FILE);
        if ($raw !== false) {
            $cache = json_decode($raw, true);
            if (
                is_array($cache)
                && isset($cache['fetched_at'], $cache['words'])
                && (time() - (int) $cache['fetched_at']) < PROFANITY_CACHE_TTL
            ) {
                return (array) $cache['words'];
            }
        }
    }

    $words = fetchWordListFromUrls();

    if (empty($words)) {
        return [];
    }

    $words = array_values(array_unique($words));
    @file_put_contents(
        PROFANITY_CACHE_FILE,
        json_encode(['fetched_at' => time(), 'words' => $words])
    );

    return $words;
}

/**
 * Returns the banned-word list normalized and filtered to >= 4 characters
 * to avoid false positives from very short substrings.
 * Result is memoized for the duration of the request.
 *
 * @return string[]
 */
function getBannedWordsNormalized(): array
{
    static $normalized = null;

    if ($normalized === null) {
        $raw        = loadBannedWords();
        $normalized = array_map('normalizeText', $raw);
        $normalized = array_filter($normalized, fn($w) => mb_strlen($w) >= 4);
        $normalized = array_values(array_unique($normalized));
    }

    return $normalized;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if $name contains at least one banned word after normalization.
 * Matching uses word boundaries to avoid false positives inside longer words.
 */
function filterProfanity(string $name): bool
{
    $normalized = normalizeText($name);
    foreach (getBannedWordsNormalized() as $word) {
        if (preg_match('/\b' . preg_quote($word, '/') . '\b/', $normalized)) {
            return true;
        }
    }
    return false;
}

/**
 * Replaces banned words in $name with asterisks.
 * Since normalizeText maps every character 1-to-1, byte positions
 * in the normalized string correspond to positions in the original.
 */
function sanitizeName(string $name): string
{
    $normalized = normalizeText($name);

    foreach (getBannedWordsNormalized() as $word) {
        $pattern = '/\b' . preg_quote($word, '/') . '\b/';
        $len     = strlen($word);

        $pos = 0;
        while (preg_match($pattern, $normalized, $m, PREG_OFFSET_CAPTURE, $pos)) {
            $start      = (int) $m[0][1];
            $stars      = str_repeat('*', $len);
            $normalized = substr_replace($normalized, $stars, $start, $len);
            $name       = substr_replace($name, $stars, $start, $len);
            $pos        = $start + $len;
        }
    }

    return $name;
}
