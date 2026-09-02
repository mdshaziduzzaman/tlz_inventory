<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Rows written while the app ran on UTC hold UTC wall-clock time. Now that the
 * app is on Asia/Dhaka those same strings are read as local time, which puts
 * every existing record six hours early — and anything stamped after 6pm local
 * on the wrong calendar day, so it disappeared from that day's report.
 *
 * This shifts them once, by the offset between UTC and the configured zone.
 * Rows written from here on are already local and are not touched.
 */
return new class extends Migration
{
    /** table => datetime columns to move */
    private const COLUMNS = [
        'variables'     => ['created_at', 'updated_at'],
        'customers'     => ['created_at', 'updated_at'],
        'products'      => ['created_at', 'updated_at', 'sold_at', 'last_at'],
        'sales'         => ['created_at', 'updated_at'],
        'stock_returns' => ['created_at', 'updated_at'],
        'users'         => ['created_at', 'updated_at'],
        'roles'         => ['created_at', 'updated_at'],
    ];

    public function up(): void
    {
        $this->shift($this->offsetSeconds());
    }

    public function down(): void
    {
        $this->shift(-$this->offsetSeconds());
    }

    /**
     * Seconds to add to a UTC wall-clock reading to make it local. Derived
     * rather than hard-coded, so a deployment in another zone is still right.
     */
    private function offsetSeconds(): int
    {
        $zone = config('app.timezone', 'UTC');

        return (new DateTimeZone($zone))->getOffset(new DateTime('now', new DateTimeZone('UTC')));
    }

    private function shift(int $seconds): void
    {
        if ($seconds === 0) {
            return;
        }

        foreach (self::COLUMNS as $table => $columns) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            foreach ($columns as $column) {
                if (! Schema::hasColumn($table, $column)) {
                    continue;
                }

                /* NULL stays NULL — an unsold pair has no sold_at to move. */
                DB::table($table)
                    ->whereNotNull($column)
                    ->update([
                        $column => DB::raw("DATE_ADD(`$column`, INTERVAL $seconds SECOND)"),
                    ]);
            }
        }
    }
};
