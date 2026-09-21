<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Role extends Model
{
    protected $fillable = ['name', 'perms', 'created_by'];

    protected $casts = ['perms' => 'array'];

    /**
     * Every key the permission system can grant, in sidebar order.
     *
     * Most are pages. `salesShowBarcode` is not — it is one button inside
     * Sales / Stock Out, listed here so a role can be given it without also
     * being made Super Admin. Anything that walks this list looking for a
     * page must skip the action keys; see ACTIONS.
     */
    public const MODULES = [
        'variable', 'product', 'barcode', 'customer',
        'sales', 'salesShowBarcode', 'return',
        'repSummary', 'repDate', 'userAccess', 'roleAccess', 'settings',
    ];

    /** Action keys, mapped to the page they live on. */
    public const ACTIONS = [
        'salesShowBarcode' => 'sales',
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
        /* Super Admin is documented as always having full access, and its
           access cannot be edited. Read that from the role rather than from
           the stored map, which goes stale the moment MODULES gains a key. */
        if ($this->isSuperAdmin()) {
            return true;
        }

        if (! ($this->perms[$module] ?? false)) {
            return false;
        }

        /* An action is meaningless without the page it sits on, so a stray
           tick on the child can never outlive the parent being switched off. */
        $parent = self::ACTIONS[$module] ?? null;

        return $parent === null || (bool) ($this->perms[$parent] ?? false);
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

    /**
     * The map to hand the browser. Super Admin gets a full one whatever is
     * stored, so the client never has to special-case the role and a newly
     * added key is never missing from it.
     */
    public function wirePerms(): array
    {
        return $this->isSuperAdmin() ? self::allPerms() : ($this->perms ?? []);
    }
}
