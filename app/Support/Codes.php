<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Human-facing sequence numbers.
 *
 * The prototype kept these counters in localStorage, so two browser tabs would
 * happily mint the same barcode. Here every bump takes a row lock, and callers
 * are expected to already be inside a transaction — the lock is then held until
 * their commit, which is what makes "reserve a block of barcodes then insert
 * the products" safe against a second cashier doing the same thing.
 */
class Codes
{
    /** Reserve `$count` consecutive numbers and return the first one. */
    /**
     * `$startAt` is where a *missing* counter begins — ignored once the row
     * exists. Sequences whose rows outlive the counter (users, customers)
     * pass their table's current high-water mark, so a counter that is lost
     * to a wipe or a restore picks up where the data actually is instead of
     * handing out codes that already exist.
     */
    public static function bump(string $key, int $count = 1, int $startAt = 0): int
    {
        DB::table('counters')->insertOrIgnore(['key' => $key, 'value' => $startAt]);

        $current = (int) DB::table('counters')
            ->where('key', $key)
            ->lockForUpdate()
            ->value('value');

        DB::table('counters')->where('key', $key)->update(['value' => $current + $count]);

        return $current + 1;
    }

    /** The next number without consuming it — for the "NEXT ·" chip. */
    public static function peek(string $key): int
    {
        return ((int) DB::table('counters')->where('key', $key)->value('value')) + 1;
    }

    /** YYMMDD, the prefix every daily sequence is namespaced by. */
    public static function dateKey(?\DateTimeInterface $when = null): string
    {
        return ($when ?? now())->format('ymd');
    }

    public static function barcode(string $dateKey, int $n): string
    {
        return $dateKey . str_pad((string) $n, 4, '0', STR_PAD_LEFT);
    }

    /**
     * The highest number already issued in a `PREFIX-0001` style column —
     * what a lost counter should resume from.
     */
    public static function highest(string $table, string $column, string $prefix): int
    {
        return (int) DB::table($table)
            ->where($column, 'like', $prefix . '%')
            ->max(DB::raw('CAST(SUBSTRING(`' . $column . '`, ' . (strlen($prefix) + 1) . ') AS UNSIGNED)'));
    }

    public static function pad(int $n, int $width): string
    {
        return str_pad((string) $n, $width, '0', STR_PAD_LEFT);
    }
}
