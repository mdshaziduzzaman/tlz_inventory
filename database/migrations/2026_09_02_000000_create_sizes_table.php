<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The size choices on Add Product used to be a constant in the JavaScript, so
 * stocking a 47 meant editing and redeploying the app. This makes the list
 * data the shop owns.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sizes', function (Blueprint $t) {
            $t->id();
            $t->string('label', 20)->unique();
            $t->timestamps();
        });

        /* The run the prototype hard-coded, so nothing changes on day one. */
        $now = now();
        DB::table('sizes')->insert(array_map(
            fn ($s) => ['label' => (string) $s, 'created_at' => $now, 'updated_at' => $now],
            range(38, 46)
        ));

        /* Any size already used on a variant belongs in the list too — an
           install that ran the old free-text size field may have others. */
        $extra = DB::table('variables')
            ->select('size')
            ->distinct()
            ->pluck('size')
            ->reject(fn ($s) => DB::table('sizes')->where('label', $s)->exists())
            ->map(fn ($s) => ['label' => $s, 'created_at' => $now, 'updated_at' => $now])
            ->all();

        if ($extra) {
            DB::table('sizes')->insert($extra);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('sizes');
    }
};
