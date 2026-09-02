<?php

use App\Http\Controllers\ArticleController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\BootstrapController;
use App\Http\Controllers\ColorController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\MaintenanceController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\ReturnController;
use App\Http\Controllers\RoleController;
use App\Http\Controllers\SaleController;
use App\Http\Controllers\SizeController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

/* The SPA is one page; the router below is its data layer. Everything lives in
   the `web` group so the session cookie and CSRF token apply — same origin, no
   token juggling needed. */
Route::view('/', 'app')->name('app');

Route::prefix('api')->group(function () {
    Route::post('login', [AuthController::class, 'login'])->middleware('throttle:10,1');
    Route::get('me', [AuthController::class, 'me']);

    Route::middleware('auth')->group(function () {
        Route::post('logout', [AuthController::class, 'logout']);

        Route::get('bootstrap', [BootstrapController::class, 'index']);
        Route::get('next-code', [BootstrapController::class, 'nextCode']);

        /* The three master lists Add Product draws on. They share one screen,
           so one module gate covers all of them. */
        Route::middleware('module:variable')->group(function () {
            Route::post('articles', [ArticleController::class, 'store']);
            Route::delete('articles/{id}', [ArticleController::class, 'destroy']);
            /* POST rather than PUT: the browser can only send a file upload
               as multipart on a POST, and this carries the article photo. */
            Route::post('articles/{id}', [ArticleController::class, 'update']);

            Route::post('colors', [ColorController::class, 'store']);
            Route::delete('colors/{id}', [ColorController::class, 'destroy']);

            Route::post('sizes', [SizeController::class, 'store']);
            Route::delete('sizes/{id}', [SizeController::class, 'destroy']);
        });

        Route::middleware('module:product')->group(function () {
            Route::post('products', [ProductController::class, 'store']);
        });

        Route::middleware('module:customer')->group(function () {
            Route::post('customers', [CustomerController::class, 'store']);
            Route::delete('customers/{customer}', [CustomerController::class, 'destroy']);
        });

        Route::middleware('module:sales')->group(function () {
            Route::post('sales', [SaleController::class, 'store']);
        });

        Route::middleware('module:return')->group(function () {
            Route::post('returns', [ReturnController::class, 'store']);
        });

        Route::middleware('module:userAccess')->group(function () {
            Route::post('users', [UserController::class, 'store']);
            Route::post('users/{user}/password', [UserController::class, 'resetPassword']);
            Route::post('users/{user}/toggle', [UserController::class, 'toggle']);
            Route::delete('users/{user}', [UserController::class, 'destroy']);
        });

        Route::middleware('module:roleAccess')->group(function () {
            Route::post('roles', [RoleController::class, 'store']);
            Route::put('roles/{role}', [RoleController::class, 'update']);
            Route::delete('roles/{role}', [RoleController::class, 'destroy']);
        });

        /* Wiping the data is Super Admin only — the module middleware cannot
           express that, so the controller checks the role itself. */
        Route::post('reset-demo-data', [MaintenanceController::class, 'resetDemoData']);
    });
});
