<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    use Notifiable;

    protected $fillable = ['code', 'name', 'username', 'password', 'role_id', 'disabled'];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'disabled' => 'boolean',
        ];
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    public function isSuperAdmin(): bool
    {
        return (bool) $this->role?->isSuperAdmin();
    }

    public function allows(string $module): bool
    {
        return (bool) $this->role?->allows($module);
    }

    /** The shape the frontend expects for the signed-in user. */
    public function toWire(): array
    {
        return [
            'id'       => $this->id,
            'code'     => $this->code,
            'name'     => $this->name,
            'username' => $this->username,
            'roleId'   => $this->role_id,
            'roleName' => $this->role?->name,
            'disabled' => $this->disabled,
            'perms'    => $this->role?->perms ?? [],
        ];
    }
}
