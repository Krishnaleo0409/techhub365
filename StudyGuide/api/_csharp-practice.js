"use strict";

// Original KR7Tech scenarios; appended after the existing free previews.
module.exports = [
  {
    question: "Two parallel calls fail. Why does awaiting Task.WhenAll not show every failure?",
    answer: "The combined task records all faults, but awaiting it normally throws one exception rather than an AggregateException containing every failure. Keep the combined task and inspect its Exception after it faults when diagnostics need every error. Do not retry every operation blindly: another operation may already have completed a non-idempotent write.",
    example: "Task combined = Task.WhenAll(LoadCatalogAsync(), LoadPricesAsync());\ntry { await combined; }\ncatch {\n    if (combined.Exception is { } aggregate)\n        foreach (Exception error in aggregate.Flatten().InnerExceptions)\n            logger.LogError(error, \"Parallel dependency failed\");\n    throw;\n}",
  },
  {
    question: "Does canceling task.WaitAsync(token) stop the work represented by that task?",
    answer: "No. WaitAsync can stop this caller's wait without canceling the original operation. Cancellation is cooperative: pass an appropriate token into the underlying API when that operation should stop too. Shared work may intentionally continue for other callers. Decide who owns cancellation and ensure abandoned work still has a responsible owner that observes completion or failure.",
    example: "Task<Result> shared = cache.GetOrStartAsync(key);\nResult result = await shared.WaitAsync(requestAborted);\n// This request can stop waiting without canceling other callers' shared work.",
  },
  {
    question: "How do you give an outgoing C# operation a budget without losing caller cancellation?",
    answer: "Create a linked CancellationTokenSource from the caller's token and apply CancelAfter to that linked source. Pass its token into the actual operation and dispose the source when finished. Distinguish cancellation requested by the caller from expiration of the operation budget when reporting outcomes; both may arrive as OperationCanceledException. Cancellation does not undo a remote operation that already committed.",
    example: "using var budget = CancellationTokenSource.CreateLinkedTokenSource(callerToken);\nbudget.CancelAfter(TimeSpan.FromSeconds(3));\ntry { return await client.GetAsync(uri, budget.Token); }\ncatch (OperationCanceledException) when (!callerToken.IsCancellationRequested) {\n    throw new TimeoutException(\"The dependency budget expired.\");\n}",
  },
  {
    question: "Why should a reusable API not assume that a ValueTask can be awaited repeatedly?",
    answer: "A ValueTask can wrap a reusable source whose completion is intended to be consumed once. Unless the producer explicitly guarantees otherwise, await it once, or convert it to a Task once if several consumers must share completion. Repeated AsTask calls are not the sharing strategy. Task is usually the simpler public contract unless measurements justify ValueTask's additional restrictions.",
    example: "ValueTask<Item> pending = reader.ReadAsync();\nTask<Item> shared = pending.AsTask();\nawait Task.WhenAll(ObserveAsync(shared), AuditAsync(shared));",
  },
  {
    question: "Who releases a resource when a consumer breaks out of an async iterator early?",
    answer: "await foreach disposes its async enumerator even when iteration ends early. Put iterator-owned cleanup in a finally block or an await using scope inside the iterator. Ensure the iterator observes cancellation: EnumeratorCancellation lets a compiler-generated async iterator combine the enumeration token with its token parameter. Cleanup must not assume every item was consumed.",
    example: "async IAsyncEnumerable<Row> ReadRowsAsync(\n    [EnumeratorCancellation] CancellationToken ct = default)\n{\n    await using var cursor = await OpenCursorAsync(ct);\n    while (await cursor.MoveNextAsync(ct)) yield return cursor.Current;\n}",
  },
  {
    question: "Can exposing IReadOnlyList<T> guarantee that a caller sees a permanent snapshot?",
    answer: "No. IReadOnlyList restricts the operations offered by that reference, not mutations performed through other aliases. A read-only wrapper over a mutable list can change later. Copy the collection when a stable collection snapshot is required. Copying an array or list is still shallow: mutable objects inside it can change unless those elements are immutable or copied too.",
    example: "IReadOnlyList<Order> liveView = orders.AsReadOnly();\nIReadOnlyList<Order> snapshot = orders.ToArray();\n// snapshot has a stable collection shape, not deep immutability of Order.",
  },
  {
    question: "Why can changing a list in a copied record also change the original record?",
    answer: "A record with expression performs a shallow copy. Reference-valued members, including List<T>, still refer to the same objects unless explicitly replaced. Record equality also does not automatically make collection contents structurally equal. Prefer immutable members or copy the mutable collection when independent ownership is necessary.",
    example: "record Basket(List<string> Products);\nvar first = new Basket(new List<string> { \"Book\" });\nvar second = first with { Products = new List<string>(first.Products) };\nsecond.Products.Add(\"Pen\");",
  },
  {
    question: "Why can a HashSet stop finding an object after one of its properties changes?",
    answer: "If equality or GetHashCode uses a mutable property, changing it after insertion can move the object's logical hash bucket without moving its stored entry. Contains and Remove may then fail. Use stable immutable keys, or remove an item before changing key fields and insert it again afterward. A hash code is not a persistent identifier or a uniqueness guarantee.",
    example: "var processed = new HashSet<Guid>();\nprocessed.Add(order.Id);\nbool alreadyProcessed = processed.Contains(order.Id);\n// Store a stable identity rather than a mutable Order as the key.",
  },
  {
    question: "How should an API compare a non-linguistic command name without allocating lowercase copies?",
    answer: "Specify ordinal comparison explicitly. OrdinalIgnoreCase is appropriate for identifiers whose contract permits case-insensitive comparison; use Ordinal when the contract is case-sensitive. Culture-sensitive comparison is for human language, not an accidental default for protocol keys. This avoids culture surprises and the allocations introduced by converting both strings to lowercase.",
    example: "if (string.Equals(command, \"refresh\", StringComparison.OrdinalIgnoreCase))\n    await RefreshAsync(ct);\nvar handlers = new Dictionary<string, Handler>(StringComparer.OrdinalIgnoreCase);",
  },
  {
    question: "Should a class dispose a dependency that was supplied by the DI container?",
    answer: "Normally no: the scope or container that created the dependency owns its disposal. Disposing an injected shared object can break other consumers. A class generally owns resources it creates itself, unless ownership is explicitly transferred. A singleton background worker should create a scope for scoped work rather than capture a scoped DbContext in its constructor.",
    example: "await using var scope = scopeFactory.CreateAsyncScope();\nvar processor = scope.ServiceProvider.GetRequiredService<OrderProcessor>();\nawait processor.ProcessAsync(message, ct);\n// Disposing the scope disposes its scoped dependencies.",
  },
  {
    question: "When is await using necessary instead of using for a C# resource?",
    answer: "Use await using when a resource's IAsyncDisposable implementation needs asynchronous cleanup, such as flushing buffered output or asynchronously releasing a remote resource. The generated finally awaits DisposeAsync, including when the body fails. Cleanup can itself fail, so avoid using disposal as the only place to record a critical business outcome or assuming the original exception can never be masked.",
    example: "await using var writer = CreateAsyncWriter();\nawait writer.WriteAsync(payload, ct);\n// DisposeAsync is awaited before control leaves this scope.",
  },
  {
    question: "What ownership rules prevent ArrayPool<T> optimizations from leaking data or corrupting output?",
    answer: "Treat a rented buffer as an exclusive lease. Use only the requested portion because the returned array can be larger, return it exactly once in a finally block, and never retain a span or reference after returning it. For buffers containing sensitive material, consider clearing on return. Do not pool merely by habit; measure allocation pressure and account for retained memory.",
    example: "byte[] buffer = ArrayPool<byte>.Shared.Rent(4096);\ntry { await stream.ReadAsync(buffer.AsMemory(0, 4096), ct); }\nfinally { ArrayPool<byte>.Shared.Return(buffer, clearArray: true); }",
  },
  {
    question: "Why is Task.WhenAll over queries on one EF Core DbContext unsafe?",
    answer: "DbContext is not designed for concurrent operations. Parallel queries sharing one context can fail even if each query is awaited eventually. Run them sequentially, combine them into one query where appropriate, or give each independently parallel operation its own context using a factory. Separate contexts also mean separate tracking and usually separate transactions, which changes consistency assumptions.",
    example: "await using var db = await factory.CreateDbContextAsync(ct);\nvar order = await db.Orders.SingleAsync(x => x.Id == id, ct);\nvar lines = await db.OrderLines.Where(x => x.OrderId == id).ToListAsync(ct);",
  },
  {
    question: "How do you protect an asynchronous critical section without holding a monitor across await?",
    answer: "The lock statement uses a synchronous monitor and cannot contain await. SemaphoreSlim can coordinate asynchronous callers: await entry and release it in finally only after successful acquisition. This coordinates callers sharing that semaphore instance; it is not a distributed lock and cannot make a database invariant safe across multiple application instances.",
    example: "await gate.WaitAsync(ct);\ntry { await UpdateSharedStateAsync(ct); }\nfinally { gate.Release(); }",
  },
  {
    question: "How does injecting TimeProvider make time-dependent .NET code easier to test?",
    answer: "Read time through an injected TimeProvider instead of directly calling system time throughout the application. This allows deterministic tests for expiry boundaries and scheduling. Use the same provider for provider-aware timers or delays; replacing only GetUtcNow does not control every timer. Compare timestamps in UTC and convert to local time only for the appropriate user-facing boundary.",
    example: "bool IsExpired(DateTimeOffset expiresAt, TimeProvider clock)\n    => clock.GetUtcNow() >= expiresAt;\nawait Task.Delay(TimeSpan.FromSeconds(1), clock, ct); // .NET 8+",
  },
  {
    question: "Why can calling Count and then iterating an IEnumerable execute a query twice?",
    answer: "IEnumerable describes an iteration contract, not a stored result. Deferred operators, iterators and query providers may repeat work or side effects on each enumeration. Materialize once when the caller needs a stable in-memory result and the size is bounded. For large database results, prefer an intentional count query and paged retrieval rather than loading everything to avoid an extra query.",
    example: "Order[] snapshot = source.ToArray();\nlogger.LogInformation(\"Processing {Count} orders\", snapshot.Length);\nforeach (Order order in snapshot) Process(order);",
  },
  {
    question: "Can ConcurrentDictionary.GetOrAdd execute an expensive value factory more than once for the same key?",
    answer: "Yes. Competing callers can run their factories even though only one value is stored. The dictionary protects its state, not side effects inside the factory. A Lazy<Task<T>> value can defer expensive work until the winning lazy is evaluated. Plan bounded eviction, failure caching and cancellation ownership; do not bind shared cached work to the first caller's short-lived request token.",
    example: "Lazy<Task<Product>> pending = cache.GetOrAdd(id,\n    key => new Lazy<Task<Product>>(() => LoadProductAsync(key)));\nProduct product = await pending.Value.WaitAsync(requestAborted);",
  },
  {
    question: "Why should a catch block usually use throw rather than throw error when propagating the same failure?",
    answer: "A bare throw preserves the current exception's stack when rethrowing from a catch block. Throwing the caught variable changes the stack information at the rethrow point, making the original failure harder to diagnose. Add context through structured logging or an appropriate wrapping exception with an inner exception; do not log confidential request bodies simply because a failure occurred.",
    example: "try { await PersistAsync(ct); }\ncatch (Exception error) {\n    logger.LogError(error, \"Persistence failed for operation {OperationId}\", operationId);\n    throw;\n}",
  },
  {
    question: "Do nullable reference annotations reject a null value received from an external caller?",
    answer: "No. Nullable reference types improve compile-time flow analysis; they do not automatically validate runtime inputs or untrusted JSON. Validate at your boundary and enforce domain invariants before using the data. A null-forgiving operator suppresses a compiler warning rather than proving the value is valid, and an initialized property can still need validation after deserialization.",
    example: "void Rename(string name)\n{\n    ArgumentException.ThrowIfNullOrWhiteSpace(name);\n    displayName = name.Trim();\n}",
  },
  {
    question: "Why should application operations return Task instead of async void?",
    answer: "A Task lets callers await completion, coordinate cancellation and observe exceptions. async void does not provide that contract and is normally reserved for event handlers required by a void delegate. Keep business work in Task-returning methods even when a UI event must be async void, and handle errors at that event boundary rather than letting them escape unexpectedly.",
    example: "public async Task SaveAsync(CancellationToken ct)\n{\n    await repository.SaveChangesAsync(ct);\n}\n// Callers await SaveAsync rather than fire-and-forget an async void operation.",
  },
];
