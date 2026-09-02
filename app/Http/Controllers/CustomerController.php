<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Support\Codes;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CustomerController extends Controller
{
    public function store(Request $request)
    {
        $data = $request->validate([
            'name'    => ['required', 'string', 'max:150'],
            'phone'   => ['required', 'string', 'max:40'],
            'email'   => ['nullable', 'email', 'max:150'],
            'address' => ['nullable', 'string', 'max:500'],
            'note'    => ['nullable', 'string', 'max:250'],
        ]);

        $c = DB::transaction(function () use ($data) {
            $n = Codes::bump('customer');

            return Customer::create($data + ['code' => 'CUS-' . Codes::pad($n, 4)]);
        });

        return response()->json(['customer' => $c->toWire()], 201);
    }

    public function destroy(Customer $customer)
    {
        /* Sales reference the customer, and wiping one would leave invoices
           pointing at nothing — the foreign key would refuse anyway, so say
           why instead of letting a 500 escape. */
        if ($customer->sales()->exists()) {
            return response()->json([
                'message' => 'Cannot delete — this customer has invoices. Their history must stay intact.',
            ], 422);
        }

        $customer->delete();

        return response()->json(['ok' => true]);
    }
}
