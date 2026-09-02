<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Customer extends Model
{
    protected $fillable = ['code', 'name', 'phone', 'email', 'address', 'note'];

    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class);
    }

    public function toWire(): array
    {
        return [
            'id'      => $this->id,
            'code'    => $this->code,
            'name'    => $this->name,
            'phone'   => $this->phone,
            'email'   => $this->email ?? '',
            'address' => $this->address ?? '',
            'note'    => $this->note ?? '',
        ];
    }
}
