<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Server-side half of the permission system. The sidebar hides modules a role
 * cannot use, but hiding a button is not access control — every route that
 * belongs to a module is gated here as well.
 */
class EnsureModuleAccess
{
    public function handle(Request $request, Closure $next, string ...$modules): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['message' => 'Not signed in.'], 401);
        }
        if ($user->disabled) {
            return response()->json(['message' => 'This account is disabled.'], 403);
        }

        foreach ($modules as $module) {
            if ($user->allows($module)) {
                return $next($request);
            }
        }

        return response()->json([
            'message' => 'Your role does not have access to this module.',
        ], 403);
    }
}
