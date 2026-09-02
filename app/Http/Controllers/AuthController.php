<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $data = $request->validate([
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        /* Usernames are matched case-insensitively, the way the prototype did —
           "Admin" and "admin" are the same person. */
        $user = User::with('role')
            ->whereRaw('LOWER(username) = ?', [mb_strtolower($data['username'])])
            ->first();

        if (! $user || ! Auth::guard('web')->attempt(
            ['username' => $user->username, 'password' => $data['password']]
        )) {
            /* One message for both cases, so this cannot be used to discover
               which user IDs exist. */
            throw ValidationException::withMessages([
                'username' => 'Wrong user ID or password.',
            ]);
        }

        if ($user->disabled) {
            Auth::guard('web')->logout();
            throw ValidationException::withMessages([
                'username' => 'This account is disabled. Ask an administrator.',
            ]);
        }

        /* Rotating the session on sign-in closes off session fixation, but it
           also mints a new CSRF token — the page's meta tag is stale from this
           point on, so hand the fresh one back for the client to adopt. */
        $request->session()->regenerate();

        return response()->json([
            'user'  => $user->fresh('role')->toWire(),
            'csrf'  => csrf_token(),
        ]);
    }

    public function logout(Request $request)
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        /* Same story on the way out — the next thing this page does is post
           the login form, which needs the token that now applies. */
        return response()->json(['ok' => true, 'csrf' => csrf_token()]);
    }

    public function me(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'user' => $user ? $user->load('role')->toWire() : null,
        ]);
    }
}
