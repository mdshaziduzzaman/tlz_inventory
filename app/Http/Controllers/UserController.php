<?php

namespace App\Http\Controllers;

use App\Models\Role;
use App\Models\User;
use App\Support\Codes;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    public function store(Request $request)
    {
        $data = $request->validate([
            'name'     => ['required', 'string', 'max:150'],
            'username' => ['required', 'string', 'max:60', 'regex:/^[A-Za-z0-9._-]+$/'],
            'password' => ['required', 'string', 'min:6', 'max:200'],
            'role_id'  => ['required', 'integer', 'exists:roles,id'],
        ]);

        if (User::whereRaw('LOWER(username) = ?', [mb_strtolower($data['username'])])->exists()) {
            return response()->json(['message' => 'That user ID is already taken.'], 422);
        }

        $u = DB::transaction(function () use ($data) {
            $n = Codes::bump('user');

            return User::create([
                'code'     => 'USR-' . Codes::pad($n, 4),
                'name'     => $data['name'],
                'username' => $data['username'],
                'password' => $data['password'],   // hashed by the model cast
                'role_id'  => $data['role_id'],
                'disabled' => false,
            ]);
        });

        return response()->json(['user' => $this->wire($u)], 201);
    }

    public function resetPassword(Request $request, User $user)
    {
        $data = $request->validate([
            'password' => ['required', 'string', 'min:6', 'max:200'],
        ]);

        $user->update(['password' => $data['password']]);

        return response()->json(['ok' => true]);
    }

    /** Enable or disable sign-in for one account. */
    public function toggle(Request $request, User $user)
    {
        /* Locking yourself out is never what you meant, and the last enabled
           Super Admin has to stay enabled or nobody can manage the system. */
        if ($user->id === $request->user()->id) {
            return response()->json(['message' => 'You cannot disable your own account.'], 422);
        }

        if (! $user->disabled && $user->isSuperAdmin() && $this->activeSuperAdmins() <= 1) {
            return response()->json([
                'message' => 'This is the last active Super Admin — disabling it would lock everyone out.',
            ], 422);
        }

        $user->update(['disabled' => ! $user->disabled]);

        return response()->json(['user' => $this->wire($user->fresh())]);
    }

    public function destroy(Request $request, User $user)
    {
        if ($user->id === $request->user()->id) {
            return response()->json(['message' => 'You cannot delete your own account.'], 422);
        }
        if ($user->isSuperAdmin() && $this->activeSuperAdmins() <= 1) {
            return response()->json([
                'message' => 'This is the last active Super Admin and cannot be deleted.',
            ], 422);
        }

        $user->delete();

        return response()->json(['ok' => true]);
    }

    private function activeSuperAdmins(): int
    {
        return User::where('disabled', false)
            ->whereHas('role', fn ($q) => $q->whereRaw('LOWER(name) = ?', ['super admin']))
            ->count();
    }

    private function wire(User $u): array
    {
        return [
            'id'        => $u->id,
            'code'      => $u->code,
            'name'      => $u->name,
            'username'  => $u->username,
            'roleId'    => $u->role_id,
            'disabled'  => $u->disabled,
            'createdAt' => $u->created_at?->toIso8601String(),
        ];
    }
}
