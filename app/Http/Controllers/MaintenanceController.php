<?php

namespace App\Http\Controllers;

use Database\Seeders\DatabaseSeeder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;

class MaintenanceController extends Controller
{
    /**
     * Wipe transactional data and reseed the starting roles and users.
     * Destructive, so it is fenced to Super Admin rather than to a module —
     * no other role should be able to erase the company's stock ledger.
     */
    public function resetDemoData(Request $request)
    {
        if (! $request->user()->isSuperAdmin()) {
            return response()->json([
                'message' => 'Only a Super Admin can reset the data.',
            ], 403);
        }

        Artisan::call('migrate:fresh', ['--force' => true, '--seed' => true]);

        return response()->json(['ok' => true]);
    }
}
