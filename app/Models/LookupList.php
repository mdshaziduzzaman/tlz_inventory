<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * A master list the shop owns: the articles, colours and sizes that Add
 * Product offers. All three behave identically — a unique label, entered
 * either on the Product Variable screen or just by typing it on Add Product —
 * so the behaviour lives here once.
 *
 * These say what the shop *can* stock. What it actually has is `products`,
 * which records the article, colour and size it was generated with as plain
 * strings; removing an entry from a list never rewrites history.
 */
abstract class LookupList extends Model
{
    protected $fillable = ['label'];

    /**
     * Numeric entries first and in numeric order, so 9 sorts before 10 and a
     * lettered value like "XL" lands after the run rather than in the middle
     * of it. Purely alphabetic lists are unaffected.
     */
    public function scopeOrdered(Builder $q): Builder
    {
        return $q->orderByRaw('label REGEXP ? DESC', ['^[0-9]+(\\.[0-9]+)?$'])
            ->orderByRaw('CAST(label AS DECIMAL(6,2))')
            ->orderBy('label');
    }

    /**
     * The spelling already on file for this value, or the value unchanged if
     * it is new. Typing "f01" today then joins the "F01" entered last week
     * instead of splitting the reports into two articles that look identical.
     */
    public static function canonical(string $value): string
    {
        return static::whereRaw('LOWER(label) = ?', [mb_strtolower($value)])
            ->value('label') ?? $value;
    }

    /** Add the value if the list does not already carry it, and return it. */
    public static function remember(string $value): string
    {
        $label = static::canonical($value);

        static::firstOrCreate(['label' => $label]);

        return $label;
    }

    public function toWire(): array
    {
        return [
            'id'    => $this->id,
            'label' => $this->label,
        ];
    }
}
