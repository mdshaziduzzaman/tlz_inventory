<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Role extends Model
{
    protected $fillable = ['name', 'perms', 'created_by'];

    protected $casts = ['perms' => 'array'];

    /** Every module key the app knows about, in sidebar order. */
    public const MODULES = [
        'variable', 'product', 'barcode', 'customer', 'sales', 'return',
        'repSummary', 'repDate', 'userAccess', 'roleAccess',
    ];

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function isSuperAdmin(): bool
    {
        return strcasecmp($this->name, 'Super Admin') === 0;
    }

    /**
     * A module the role has never been told about must not silently become
     * accessible, so anything missing from the stored map reads as false.
     */
    public function allows(string $module): bool
    {
        return (bool) ($this->perms[$module] ?? false);
    }

    /** Normalise an incoming permission map to exactly the known keys. */
    public static function normalisePerms(array $in): array
    {
        $out = [];
        foreach (self::MODULES as $key) {
            $out[$key] = (bool) ($in[$key] ?? false);
        }
        return $out;
    }

    public static function allPerms(): array
    {
        return array_fill_keys(self::MODULES, true);
    }
}
