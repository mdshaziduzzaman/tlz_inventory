<?php

use App\Http\Middleware\EnsureModuleAccess;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'module' => EnsureModuleAccess::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        /* The whole app talks to /api/* over fetch, so an expired session has
           to come back as 401 JSON — a redirect to a login route would arrive
           as an HTML page the caller cannot parse. */
        $exceptions->render(function (AuthenticationException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json(['message' => 'Your session has ended. Please sign in again.'], 401);
            }
        });
    })->create();
