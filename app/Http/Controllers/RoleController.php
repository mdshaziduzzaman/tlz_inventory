<?php

namespace App\Http\Controllers;

use App\Models\Role;
use Illuminate\Http\Request;

class RoleController extends Controller
{
    public function store(Request $request)
    {
        $data = $request->validate([
            'name'  => ['required', 'string', 'max:80'],
            'perms' => ['required', 'array'],
        ]);

        $name = trim($data['name']);

        if (Role::whereRaw('LOWER(name) = ?', [mb_strtolower($name)])->exists()) {
            return response()->json(['message' => 'A role with that name already exists.'], 422);
        }

        $role = Role::create([
            'name'       => $name,
            'perms'      => Role::normalisePerms($data['perms']),
            'created_by' => $request->user()->name,
        ]);

        return response()->json(['role' => $this->wire($role)], 201);
    }

    public function update(Request $request, Role $role)
    {
        $data = $request->validate([
            'perms' => ['required', 'array'],
        ]);

        /* Super Admin is the escape hatch — if its access could be edited away
           there would be no way back into the permission screens. */
        if ($role->isSuperAdmin()) {
            return response()->json([
                'message' => 'Super Admin always has full access and cannot be edited.',
            ], 422);
        }

        $role->update(['perms' => Role::normalisePerms($data['perms'])]);

        return response()->json(['role' => $this->wire($role->fresh())]);
    }

    public function destroy(Role $role)
    {
        if ($role->isSuperAdmin()) {
            return response()->json(['message' => 'Super Admin cannot be deleted.'], 422);
        }
        if ($role->users()->exists()) {
            return response()->json([
                'message' => 'Cannot delete — users are still assigned to this role.',
            ], 422);
        }

        $role->delete();

        return response()->json(['ok' => true]);
    }

    private function wire(Role $r): array
    {
        return [
            'id'        => $r->id,
            'name'      => $r->name,
            'perms'     => $r->perms,
            'createdAt' => $r->created_at?->toIso8601String(),
            'createdBy' => $r->created_by,
        ];
    }
}
