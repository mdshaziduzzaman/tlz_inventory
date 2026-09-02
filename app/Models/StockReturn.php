<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Customer returns and damage write-offs share one table — the prototype
 * reported them together, and `type` is the only thing that differs.
 */
class StockReturn extends Model
{
    protected $fillable = [
        'ref', 'type', 'customer_id', 'customer_name', 'reason', 'amount', 'created_by',
    ];

    protected $casts = ['amount' => 'decimal:2'];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(StockReturnItem::class);
    }

    public function toWire(): array
    {
        return [
            'ref'      => $this->ref,
            'type'     => $this->type,
            'custId'   => $this->customer_id,
            'custName' => $this->customer_name,
            'reason'   => $this->reason ?? 'Not specified',
            'items'    => $this->items->pluck('code')->all(),
            'amount'   => (float) $this->amount,
            'at'       => $this->created_at?->toIso8601String(),
        ];
    }
}
