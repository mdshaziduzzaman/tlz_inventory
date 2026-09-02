<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A photo of the article, so the person picking stock can recognise it
 * instead of matching a code. Nullable: the picture is a convenience, and an
 * article is perfectly usable without one.
 *
 * Only the path inside the public disk is stored — the URL is built at read
 * time, so moving the app to another domain does not invalidate the rows.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('articles', function (Blueprint $t) {
            $t->string('image')->nullable()->after('label');
        });
    }

    public function down(): void
    {
        Schema::table('articles', function (Blueprint $t) {
            $t->dropColumn('image');
        });
    }
};
