<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Product extends Model
{
    protected $fillable = [
        'code', 'article', 'color', 'size', 'price',
        'status', 'sold_to', 'sold_at', 'returned_from', 'last_at',
    ];

    protected $casts = [
        'price'   => 'decimal:2',
        'sold_at' => 'datetime',
        'last_at' => 'datetime',
    ];

    public function buyer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'sold_to');
    }

    /**
     * Mirrors the prototype's product record. `at` stays the generation time —
     * the reports bucket manufactured stock by it, so it must never move.
     */
    public function toWire(): array
    {
        return [
            'code'         => $this->code,
            'article'      => $this->article,
            'color'        => $this->color,
            'size'         => $this->size,
            'price'        => (float) $this->price,
            'status'       => $this->status,
            'at'           => $this->created_at?->toIso8601String(),
            'soldTo'       => $this->sold_to,
            'soldAt'       => $this->sold_at?->toIso8601String(),
            'returnedFrom' => $this->returned_from,
            'lastAt'       => $this->last_at?->toIso8601String(),
        ];
    }
}
