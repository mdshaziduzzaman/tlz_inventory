<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The Remarks box came off the Add Product form: nothing writes to this
 * column any more, so keeping it would leave a field the app can neither
 * fill nor show. No stock carried a remark when this ran, so nothing is lost.
 *
 * down() puts the column back, but not any text that was in it — that is why
 * the field was checked as empty before dropping it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $t) {
            $t->dropColumn('remarks');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $t) {
            $t->text('remarks')->nullable()->after('price');
        });
    }
};
