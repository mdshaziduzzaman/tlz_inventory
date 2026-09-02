<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * `variables` held an article/colour/size triple, which forced Add Product to
 * offer only the combinations someone had defined in advance. The shop wants
 * to stock any article in any colour in any size, so the triple splits into
 * three independent master lists — `articles`, `colors` and the `sizes` table
 * added just before this.
 *
 * Nothing is lost: products already record their article, colour and size as
 * plain strings, so existing stock and every report read the same afterwards.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['articles', 'colors'] as $table) {
            Schema::create($table, function (Blueprint $t) {
                $t->id();
                $t->string('label', 120)->unique();
                $t->timestamps();
            });
        }

        /* Seed each list from everything already named, so an install with
           history keeps offering exactly what it offered yesterday. Products
           are included as well as variants: a barcode is proof the shop
           stocked that article, whether or not a variant row survived. */
        $this->seedFrom('articles', ['variables' => 'article', 'products' => 'article']);
        $this->seedFrom('colors', ['variables' => 'color', 'products' => 'color']);
        $this->seedFrom('sizes', ['products' => 'size']);

        Schema::dropIfExists('variables');
    }

    public function down(): void
    {
        Schema::create('variables', function (Blueprint $t) {
            $t->id();
            $t->string('article');
            $t->string('color');
            $t->string('size');
            $t->timestamps();
            $t->unique(['article', 'color', 'size']);
        });

        /* The combinations that actually exist are the ones stock was made
           for; the rest were never more than an intention and cannot be
           recovered. */
        $rows = DB::table('products')
            ->select('article', 'color', 'size')
            ->distinct()
            ->get()
            ->map(fn ($r) => (array) $r + ['created_at' => now(), 'updated_at' => now()])
            ->all();

        if ($rows) {
            DB::table('variables')->insert($rows);
        }

        Schema::dropIfExists('colors');
        Schema::dropIfExists('articles');
    }

    /**
     * Copy the distinct values of the given columns into a lookup table,
     * matching case-insensitively so "Black" and "black" do not both land.
     *
     * @param  array<string,string>  $sources  table => column
     */
    private function seedFrom(string $target, array $sources): void
    {
        $seen = DB::table($target)->pluck('label')
            ->mapWithKeys(fn ($l) => [mb_strtolower($l) => true])
            ->all();

        $rows = [];
        $now  = now();

        foreach ($sources as $table => $column) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            foreach (DB::table($table)->distinct()->pluck($column) as $label) {
                $label = trim((string) $label);
                $key   = mb_strtolower($label);

                if ($label === '' || isset($seen[$key])) {
                    continue;
                }

                $seen[$key] = true;
                $rows[] = ['label' => $label, 'created_at' => $now, 'updated_at' => $now];
            }
        }

        if ($rows) {
            DB::table($target)->insert($rows);
        }
    }
};
