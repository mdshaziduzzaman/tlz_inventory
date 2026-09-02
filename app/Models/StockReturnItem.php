<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockReturnItem extends Model
{
    public $timestamps = false;

    protected $fillable = ['stock_return_id', 'product_id', 'code', 'price'];

    protected $casts = ['price' => 'decimal:2'];

    public function stockReturn(): BelongsTo
    {
        return $this->belongsTo(StockReturn::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
