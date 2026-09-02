<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The whole StockFlow schema. It replaces the browser localStorage blob the
 * prototype used, so the shapes deliberately mirror what the frontend already
 * renders — the difference is that identity, sequences and stock status are
 * now decided by the database instead of by whichever tab happened to be open.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('roles', function (Blueprint $t) {
            $t->id();
            $t->string('name')->unique();
            $t->json('perms');                 // { moduleKey: bool }
            $t->string('created_by')->default('System');
            $t->timestamps();
        });

        Schema::create('users', function (Blueprint $t) {
            $t->id();
            $t->string('code')->unique();      // USR-0001
            $t->string('name');
            $t->string('username')->unique();
            $t->string('password');            // bcrypt
            $t->foreignId('role_id')->constrained()->cascadeOnUpdate()->restrictOnDelete();
            $t->boolean('disabled')->default(false);
            $t->rememberToken();
            $t->timestamps();
        });

        Schema::create('sessions', function (Blueprint $t) {
            $t->string('id')->primary();
            $t->foreignId('user_id')->nullable()->index();
            $t->string('ip_address', 45)->nullable();
            $t->text('user_agent')->nullable();
            $t->longText('payload');
            $t->integer('last_activity')->index();
        });

        Schema::create('variables', function (Blueprint $t) {
            $t->id();
            $t->string('article');
            $t->string('color');
            $t->string('size');
            $t->timestamps();
            $t->unique(['article', 'color', 'size']);
        });

        Schema::create('customers', function (Blueprint $t) {
            $t->id();
            $t->string('code')->unique();      // CUS-0001
            $t->string('name');
            $t->string('phone');
            $t->string('email')->nullable();
            $t->text('address')->nullable();
            $t->string('note')->nullable();
            $t->timestamps();
        });

        /* One row per physical pair — the barcode is the primary business key. */
        Schema::create('products', function (Blueprint $t) {
            $t->id();
            $t->string('code')->unique();      // 2608260001
            $t->string('article');
            $t->string('color');
            $t->string('size');
            $t->decimal('price', 12, 2)->default(0);
            $t->text('remarks')->nullable();
            $t->enum('status', ['in', 'out', 'damaged'])->default('in');
            $t->foreignId('sold_to')->nullable()->constrained('customers')->nullOnDelete();
            $t->timestamp('sold_at')->nullable();
            $t->foreignId('returned_from')->nullable()->constrained('customers')->nullOnDelete();
            $t->timestamp('last_at')->nullable();
            $t->timestamps();
            $t->index(['article', 'status']);
            $t->index('created_at');
        });

        /* Every human-facing sequence lives here: barcode:260826, sale:260826,
           customer, user... Bumped under SELECT ... FOR UPDATE inside the
           caller's transaction, so two cashiers can never mint the same code. */
        Schema::create('counters', function (Blueprint $t) {
            $t->string('key', 64)->primary();
            $t->unsignedBigInteger('value')->default(0);
        });

        Schema::create('sales', function (Blueprint $t) {
            $t->id();
            $t->string('inv')->unique();       // INV-260826-001
            $t->foreignId('customer_id')->constrained()->restrictOnDelete();
            $t->string('customer_name');       // snapshot, survives a rename
            $t->decimal('sub', 12, 2)->default(0);
            $t->decimal('discount', 12, 2)->default(0);
            $t->decimal('total', 12, 2)->default(0);
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->index('created_at');
        });

        /* The price charged is stored per line, not read back off the product,
           so a later resale or price edit cannot rewrite history. */
        Schema::create('sale_items', function (Blueprint $t) {
            $t->id();
            $t->foreignId('sale_id')->constrained()->cascadeOnDelete();
            $t->foreignId('product_id')->constrained()->restrictOnDelete();
            $t->string('code');
            $t->decimal('price', 12, 2)->default(0);
            $t->unique(['sale_id', 'product_id']);
        });

        Schema::create('stock_returns', function (Blueprint $t) {
            $t->id();
            $t->string('ref')->unique();       // RET-260826-001 / DMG-260826-001
            $t->enum('type', ['return', 'damage']);
            $t->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $t->string('customer_name')->default('-');
            $t->text('reason')->nullable();
            $t->decimal('amount', 12, 2)->default(0);
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->index('created_at');
        });

        Schema::create('stock_return_items', function (Blueprint $t) {
            $t->id();
            $t->foreignId('stock_return_id')->constrained()->cascadeOnDelete();
            $t->foreignId('product_id')->constrained()->restrictOnDelete();
            $t->string('code');
            $t->decimal('price', 12, 2)->default(0);
            $t->unique(['stock_return_id', 'product_id']);
        });

        Schema::create('cache', function (Blueprint $t) {
            $t->string('key')->primary();
            $t->mediumText('value');
            $t->integer('expiration');
        });
        Schema::create('cache_locks', function (Blueprint $t) {
            $t->string('key')->primary();
            $t->string('owner');
            $t->integer('expiration');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cache_locks');
        Schema::dropIfExists('cache');
        Schema::dropIfExists('stock_return_items');
        Schema::dropIfExists('stock_returns');
        Schema::dropIfExists('sale_items');
        Schema::dropIfExists('sales');
        Schema::dropIfExists('counters');
        Schema::dropIfExists('products');
        Schema::dropIfExists('customers');
        Schema::dropIfExists('variables');
        Schema::dropIfExists('sessions');
        Schema::dropIfExists('users');
        Schema::dropIfExists('roles');
    }
};
