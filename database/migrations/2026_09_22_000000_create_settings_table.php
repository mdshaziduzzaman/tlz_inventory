<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Whole-install branding: the name on the tab, the wording beside the mark,
 * and the icon. Key/value rather than a column per field, so adding another
 * setting later is a write rather than a migration.
 *
 * Defaults live in the Setting model, not here — a missing row means "use the
 * default", which keeps an existing install working the moment this lands.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('settings', function (Blueprint $t) {
            $t->string('key', 60)->primary();
            $t->text('value')->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('settings');
    }
};
