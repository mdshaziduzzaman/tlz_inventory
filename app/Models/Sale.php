<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Sale extends Model
{
    protected $fillable = [
        'inv', 'customer_id', 'customer_name', 'sub', 'discount', 'total', 'created_by',
    ];

    protected $casts = [
        'sub'      => 'decimal:2',
        'discount' => 'decimal:2',
        'total'    => 'decimal:2',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(SaleItem::class);
    }

    /**
     * What the customer actually paid for each pair on this invoice, keyed by
     * barcode. The discount is charged to the whole invoice, so it is spread
     * across the pairs in proportion to their price; the last line takes the
     * rounding remainder, which is what makes the parts add back up to
     * `total` exactly.
     *
     * This is the figure a refund must use. The label price was never what
     * changed hands on a discounted invoice.
     */
    public function netByCode(): array
    {
        $lines = $this->items()->orderBy('id')->get()->values();

        $sub  = (float) $this->sub ?: (float) $lines->sum('price');
        $disc = (float) $this->discount;
        $last = $lines->count() - 1;

        $out  = [];
        $used = 0.0;

        foreach ($lines as $i => $line) {
            $price = (float) $line->price;
            $share = $i === $last
                ? round($disc - $used, 2)
                : round($sub > 0 ? $price / $sub * $disc : 0.0, 2);

            $used += $share;
            $out[$line->code] = round($price - $share, 2);
        }

        return $out;
    }

    public function toWire(): array
    {
        $items = $this->items;

        return [
            'inv'      => $this->inv,
            'custId'   => $this->customer_id,
            'custName' => $this->customer_name,
            'items'    => $items->pluck('code')->all(),
            'prices'   => $items->map(fn ($i) => (float) $i->price)->all(),
            'sub'      => (float) $this->sub,
            'discount' => (float) $this->discount,
            'total'    => (float) $this->total,
            'at'       => $this->created_at?->toIso8601String(),
        ];
    }
}
