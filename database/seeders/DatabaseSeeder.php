<?php

namespace Database\Seeders;

use App\Models\Article;
use App\Models\Color;
use App\Models\Customer;
use App\Models\Role;
use App\Models\Size;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        /* Roles first — users point at them. Everything here is matched by
           name and updated in place, so re-running the seeder on a live
           install tops it up instead of duplicating. */
        $everything = Role::allPerms();

        $admin = $everything;
        $admin['userAccess'] = false;
        $admin['roleAccess'] = false;

        $roles = [
            ['name' => 'Super Admin',    'perms' => $everything],
            ['name' => 'Admin',          'perms' => $admin],
            ['name' => 'Store Manager',  'perms' => Role::normalisePerms([
                'variable' => true, 'product' => true, 'barcode' => true, 'customer' => true,
                'sales' => true, 'return' => true, 'repSummary' => true, 'repDate' => true,
            ])],
            ['name' => 'Sales Operator', 'perms' => Role::normalisePerms([
                'customer' => true, 'sales' => true, 'return' => true,
            ])],
        ];

        foreach ($roles as $r) {
            Role::updateOrCreate(
                ['name' => $r['name']],
                ['perms' => $r['perms'], 'created_by' => 'System']
            );
        }

        $superAdminId = Role::where('name', 'Super Admin')->value('id');
        $adminId      = Role::where('name', 'Admin')->value('id');

        $users = [
            ['code' => 'USR-0001', 'name' => 'Md Shazid', 'username' => 'mdshazid',
             'password' => '123456',   'role_id' => $superAdminId],
            ['code' => 'USR-0002', 'name' => 'Admin',     'username' => 'Admin',
             'password' => '12345678', 'role_id' => $adminId],
        ];

        foreach ($users as $u) {
            User::updateOrCreate(['username' => $u['username']], $u + ['disabled' => false]);
        }

        DB::table('counters')->updateOrInsert(['key' => 'user'], ['value' => count($users)]);

        /* Starter entries so the dropdowns are not blank on first run. The
           size run is the one the prototype hard-coded. */
        $this->seedList(Article::class, ['SH-1001', 'SH-1002']);
        $this->seedList(Color::class, ['Black', 'Brown', 'Tan']);
        $this->seedList(Size::class, array_map('strval', range(38, 46)));

        if (Customer::count() === 0) {
            Customer::create([
                'code' => 'CUS-0001', 'name' => 'Rahim Mia', 'phone' => '01711223344',
                'email' => 'rahim@example.com', 'address' => 'Dhaka', 'note' => '',
            ]);
            DB::table('counters')->updateOrInsert(['key' => 'customer'], ['value' => 1]);
        }
    }

    /**
     * Fill a master list, but only if it is empty — reseeding must not put
     * back an entry the shop deliberately removed.
     *
     * @param  class-string<\App\Models\LookupList>  $model
     * @param  list<string>  $labels
     */
    private function seedList(string $model, array $labels): void
    {
        if ($model::count() > 0) {
            return;
        }

        $model::insert(array_map(
            fn ($l) => ['label' => $l, 'created_at' => now(), 'updated_at' => now()],
            $labels
        ));
    }
}
