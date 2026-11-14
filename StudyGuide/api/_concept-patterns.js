"use strict";

// Original teaching examples; contracts omitted from excerpts are described in the lesson.
const GOF_REFERENCE = "https://www.informit.com/store/design-patterns-elements-of-reusable-object-oriented-9780201633610";
const CLOUD_REFERENCE = "https://learn.microsoft.com/en-us/azure/architecture/patterns/";

function objectPattern(id, name, group, what, why, how, flow, example, pitfall, exercise) {
  return {
    id:`micro-pattern-${id}`, category:"Microservices", title:`${name} pattern (${group})`,
    summary:`${group} object design inside a service: ${why}`,
    what, why,
    how:`${how} Each C# excerpt is independent: place type declarations at namespace scope and usage statements in Main or a test, with normal imports and any named domain contracts. This is an in-process pattern, not a distributed-consistency guarantee.`,
    flow, example,
    steps:["Identify the responsibility that varies and the invariant that must remain stable.",
      "Trace the example's collaboration, then implement the exercise in a local C# test project."],
    cheat:[`${group} pattern; apply inside an appropriate service boundary.`, "Prefer the simplest design that handles a demonstrated source of change."],
    pitfalls:[pitfall, "An interface or class pattern does not make remote effects atomic, durable, or authorized."],
    exercise, reference:GOF_REFERENCE,
  };
}

function distributedPattern(id, title, what, why, how, flow, example, pitfall, exercise, reference = CLOUD_REFERENCE) {
  return {
    id:`micro-pattern-${id}`, category:"Microservices", title,
    summary:why, what, why,
    how:`${how} Code is a focused teaching excerpt, not a complete deployed service. Supply the named persistence/transport contracts and test the stated failure windows.`,
    flow, example,
    steps:["Write down the owner, durable evidence, failure window, and replay contract.",
      "Trace the code on success, then inject the failure described in the exercise."],
    cheat:["State the consistency and failure contract explicitly.", "Keep authorization, deadlines, capacity, and operational recovery visible."],
    pitfalls:[pitfall], exercise, reference,
  };
}

module.exports = [
  {
    id:"micro-pattern-map", category:"Microservices", title:"Design-pattern map: all 23 GoF patterns and distributed patterns",
    summary:"Choose patterns by their problem: object creation, structure, behavior, or a distributed failure boundary.",
    what:"This topic contains the complete 23-pattern Gang of Four object-design catalog: 5 creational, 7 structural, and 11 behavioral patterns. It also covers practical microservice patterns. Object patterns organize collaborators inside a service; distributed patterns address independently failing services and stores. There is no finite universal list of every architectural pattern.",
    why:"Confusing the two levels leads to claims such as Observer guarantees message delivery or Singleton provides a global distributed lock. A useful design names the actual problem and acknowledges the cost of the chosen mechanism.",
    how:"Start with the existing Microservices foundations, then read the object-pattern catalog and distributed code labs. C# examples are independent excerpts: put declarations at namespace scope and usage statements inside Main or a test, with appropriate imports. Some name domain or infrastructure contracts rather than implement a production system. Record when not to use each pattern. Do not copy every pattern into a small CRUD service.",
    steps:["Classify a requirement as object construction, object collaboration, or a cross-process guarantee.",
      "Study one pattern and its counterexample.", "Implement a small test before adding infrastructure."],
    flow:"Problem -> required guarantee -> smallest suitable pattern -> example -> failure test -> trade-off",
    example:"// Local behavior selection: Strategy\nIDiscount discount = new PercentageDiscount(10m);\nvar total = discount.Apply(100m);\n// Reliable cross-service notification is a separate concern:\n// commit business state + outbox, then publish and deduplicate consumption.",
    cheat:["Creational: Factory Method, Abstract Factory, Builder, Prototype, Singleton.",
      "Structural: Adapter, Bridge, Composite, Decorator, Facade, Flyweight, Proxy.",
      "Behavioral: Chain of Responsibility, Command, Interpreter, Iterator, Mediator, Memento, Observer, State, Strategy, Template Method, Visitor.",
      "Object events are not durable broker messages.", "A modular monolith can use these object patterns without becoming microservices."],
    pitfalls:["Repository and dependency injection are useful additional patterns, but are not two extra GoF patterns.",
      "No pattern removes the need to enforce tenant access and business invariants."],
    exercise:"For checkout, classify pricing calculation, provider construction, durable notification, and compensating a stock reservation. Choose a pattern for each and state a simpler alternative.",
    reference:GOF_REFERENCE,
  },
  objectPattern("factory-method", "Factory Method", "creational",
    "A base workflow delegates creation of one product to an overridable factory method.",
    "Keep an export workflow stable while a subtype chooses the writer.",
    "Define the writer contract and place the creation hook on the workflow; do not make callers switch on concrete writer types.",
    "Export workflow -> creation hook -> writer contract -> output",
    `interface IWriter { string Write(string value); }
sealed class PlainWriter : IWriter { public string Write(string value) => value.Replace("\\r", " ").Replace("\\n", " "); }
abstract class ExportJob {
    protected abstract IWriter CreateWriter();
    public string Run(string value) => CreateWriter().Write(value);
}
sealed class PlainExport : ExportJob {
    protected override IWriter CreateWriter() => new PlainWriter();
}`,
    "A static switch that returns a class is a simple factory, not necessarily the Factory Method pattern.",
    "Add a second writer without changing ExportJob.Run, and test that each workflow uses its writer."),
  objectPattern("abstract-factory", "Abstract Factory", "creational",
    "One factory creates a compatible family of related products.",
    "Select an integration family without mixing its request formatter and response parser.",
    "Define product interfaces and a factory exposing each family member; select the concrete family at the composition boundary.",
    "Configured family -> factory -> matching products -> integration workflow",
    `interface IRequestFormat { string Encode(string value); }
interface IReplyParser { string Decode(string value); }
interface IPartnerFactory {
    IRequestFormat CreateFormatter();
    IReplyParser CreateParser();
}
sealed class PartnerClient(IPartnerFactory factory) {
    public string RoundTrip(string value) {
        var wire = factory.CreateFormatter().Encode(value);
        return factory.CreateParser().Decode(wire); // Local demonstration, not an HTTP exchange.
    }
}`,
    "Adding a new product kind affects every factory; use a family only when products genuinely belong together.",
    "Implement two local protocol families and prove the client never mixes their formatter and parser."),
  objectPattern("builder", "Builder", "creational",
    "Construct a complex product through explicit steps before exposing the finished result.",
    "Make optional configuration readable while validating the final combination.",
    "Keep partially built state private and validate at Build; use ordinary constructors for simple values.",
    "Steps -> private construction state -> validation -> completed value",
    `record ExportOptions(string Format, int PageSize);
sealed class ExportBuilder {
    private string format = "csv";
    private int pageSize = 100;
    public ExportBuilder WithFormat(string value) { format = value; return this; }
    public ExportBuilder WithPageSize(int value) { pageSize = value; return this; }
    public ExportOptions Build() {
        if (format is not ("csv" or "json") || pageSize is < 1 or > 1000)
            throw new ArgumentException("Invalid export options.");
        return new(format, pageSize);
    }
}`,
    "A fluent API is not useful if Build can silently produce invalid state.",
    "Test invalid sizes and two independent builders; explain whether reuse of one builder is allowed."),
  objectPattern("prototype", "Prototype", "creational",
    "Create a new object from an existing configured instance with an explicit copy policy.",
    "Reuse a template without sharing mutable state accidentally.",
    "Identify immutable values and mutable children before defining cloning; C# record copies are shallow.",
    "Configured prototype -> owned copy -> independent customization",
    `sealed class ReportTemplate {
    public List<string> Columns { get; init; } = new();
    public ReportTemplate Copy() => new() { Columns = new List<string>(Columns) };
}
var original = new ReportTemplate { Columns = new() { "Id" } };
var copy = original.Copy();
copy.Columns.Add("Total");
// original.Columns still contains only Id; strings themselves are immutable.`,
    "Copying only an outer object can still share nested mutable objects.",
    "Add a nested mutable column object and implement the additional copy behavior it requires."),
  objectPattern("singleton", "Singleton", "creational",
    "Restrict creation so a defined scope shares one instance, with explicit concurrency and ownership.",
    "Share a small immutable lookup rather than repeatedly constructing identical data.",
    "Keep instance construction controlled and state immutable; a container singleton is usually preferable for application collaborators.",
    "First access -> controlled construction -> shared immutable instance",
    `sealed class CurrencyRules {
    private static readonly Lazy<CurrencyRules> instance = new(() => new CurrencyRules());
    public static CurrencyRules Instance => instance.Value;
    private CurrencyRules() { }
    public int MinorDigits(string currency) => currency == "JPY" ? 0 : 2;
}`,
    "Singleton means a process/container scope, not one instance across replicas; mutable fields are not automatically thread-safe.",
    "Explain why this cannot enforce a global inventory limit or replace a scoped DbContext."),
  objectPattern("adapter", "Adapter", "structural",
    "Translate an existing interface into the contract a caller expects.",
    "Keep legacy naming and units out of the application's own model.",
    "Wrap the foreign collaborator and validate its values at the boundary; distinguish a local adapter from the wider anti-corruption layer.",
    "Local contract -> adapter -> foreign contract -> translated result",
    `interface IStock { int Available(string sku); }
sealed class LegacyStock { public string ReadUnits(string code) => "12"; }
sealed class StockAdapter(LegacyStock legacy) : IStock {
    public int Available(string sku) {
        if (!int.TryParse(legacy.ReadUnits(sku), out var units) || units < 0)
            throw new InvalidOperationException("Invalid stock response.");
        return units;
    }
}`,
    "An adapter should not silently convert an invalid foreign response into zero stock.",
    "Test malformed, negative, and valid legacy quantities."),
  objectPattern("bridge", "Bridge", "structural",
    "Separate an abstraction from its implementation so both dimensions can vary independently.",
    "Vary notification purpose and delivery mechanism without a subclass for every combination.",
    "Inject a delivery implementor into the notification abstraction; keep domain content separate from transport.",
    "Notification abstraction -> delivery implementor -> chosen transport",
    `interface IDelivery { Task SendAsync(string text, CancellationToken ct); }
abstract class Notice(IDelivery delivery) {
    protected abstract string Text { get; }
    public Task SendAsync(CancellationToken ct) => delivery.SendAsync(Text, ct);
}
sealed class OrderNotice(IDelivery delivery, string orderId) : Notice(delivery) {
    protected override string Text => $"Order {orderId} accepted";
}`,
    "Bridge separates independently varying dimensions; it is not merely renaming Adapter.",
    "Add a maintenance notice and an in-memory delivery without changing OrderNotice."),
  objectPattern("composite", "Composite", "structural",
    "Represent leaves and groups behind one contract for recursive whole-part structures.",
    "Price an item or a bundle through one operation while preserving the tree's meaning.",
    "Give leaves a direct implementation and groups a recursive implementation; prevent cycles and define currency ownership.",
    "Root component -> child components -> recursive result",
    `interface ICharge { decimal Total(); }
sealed record ItemCharge(decimal Amount) : ICharge {
    public decimal Total() => Amount;
}
sealed class ChargeGroup(IReadOnlyList<ICharge> children) : ICharge {
    public decimal Total() => children.Sum(child => child.Total());
}`,
    "A cycle is not a valid tree; deep untrusted hierarchies also need depth and size limits.",
    "Build nested bundles and test an empty group, currency policy, and cycle prevention in a mutable variant."),
  objectPattern("decorator", "Decorator", "structural",
    "Wrap a collaborator with additional behavior while preserving its interface.",
    "Add timing around a service without changing its core implementation.",
    "Delegate through the same contract, preserve cancellation and errors, and make wrapper order deliberate.",
    "Caller -> outer decorator -> inner service -> result through wrappers",
    `interface IQuote { Task<decimal> GetAsync(CancellationToken ct); }
sealed class TimedQuote(IQuote inner, Action<TimeSpan> record) : IQuote {
    public async Task<decimal> GetAsync(CancellationToken ct) {
        var start = System.Diagnostics.Stopwatch.StartNew();
        try { return await inner.GetAsync(ct); }
        finally { record(start.Elapsed); }
    }
}`,
    "A throwing telemetry callback in finally can hide the original error; production telemetry must not break the operation.",
    "Use a fake inner service to test timing on success, failure, and cancellation."),
  objectPattern("facade", "Facade", "structural",
    "Expose a focused entry point over several lower-level collaborators.",
    "Keep a client from knowing every local order-summary dependency.",
    "Compose existing capabilities behind a small use-case contract without moving all domain rules into a god object.",
    "Client -> facade -> local collaborators -> focused response",
    `record OrderView(string Id, decimal Total);
interface IOrders { OrderView FindOwned(string userId, string orderId); }
interface ITracking { string Status(string orderId); }
sealed class OrderScreen(IOrders orders, ITracking tracking) {
    public (OrderView Order, string Shipping) Load(string userId, string orderId) {
        var order = orders.FindOwned(userId, orderId);
        return (order, tracking.Status(order.Id));
    }
}`,
    "A facade over remote services still needs deadlines, partial-failure rules, and authorization.",
    "Test that tracking is never requested when the caller cannot access the order."),
  objectPattern("flyweight", "Flyweight", "structural",
    "Share immutable intrinsic data while keeping per-use state outside the shared object.",
    "Avoid duplicating the same immutable label definition for thousands of rendered markers.",
    "Separate the reusable definition from coordinates or other request-specific state, and bound the shared key space.",
    "Bounded key -> shared immutable definition + external per-use state",
    `record LabelStyle(string Color, int Size);
sealed class Styles {
    private readonly Dictionary<string, LabelStyle> values = new() {
        ["normal"] = new("#fff", 14), ["warning"] = new("#ff0", 14)
    };
    public LabelStyle Get(string key) => values[key];
}
record Marker(LabelStyle Style, int X, int Y);`,
    "A global cache accepting arbitrary user keys can grow without bound.",
    "Create many markers sharing two styles and prove moving one marker does not mutate another."),
  objectPattern("proxy", "Proxy", "structural",
    "Stand in for another object to control access, initialization, or invocation.",
    "Enforce a local access check before asking a report collaborator for data.",
    "Preserve the subject contract and make the access rule explicit; a remote subject must still validate its own authorization.",
    "Caller -> proxy check -> real subject or rejection",
    `interface IReport { string Read(string userId); }
sealed class ReportProxy(IReport inner, Func<string, bool> allowed) : IReport {
    public string Read(string userId) {
        if (!allowed(userId)) throw new UnauthorizedAccessException();
        return inner.Read(userId);
    }
}`,
    "A caller-supplied user ID is not a trusted identity; obtain identity from the authenticated boundary.",
    "Test denial prevents invocation and explain which checks belong at a remote server too."),
  objectPattern("chain-of-responsibility", "Chain of Responsibility", "behavioral",
    "Pass a request through a configurable sequence of handlers with explicit continuation or short-circuiting.",
    "Keep validation steps focused and order their effects deliberately.",
    "Give each handler a next operation; terminate on rejection and call next exactly once on acceptance.",
    "Request -> handler -> next handler or short-circuit -> outcome",
    `delegate Task RequestStep(string value, CancellationToken ct);
static RequestStep RequireValue(RequestStep next) => async (value, ct) => {
    if (string.IsNullOrWhiteSpace(value)) throw new ArgumentException("Value required.");
    await next(value, ct);
};
RequestStep save = (value, ct) => Task.CompletedTask;
var pipeline = RequireValue(save);
await pipeline("order", CancellationToken.None);`,
    "Changing handler order can change security or transaction behavior.",
    "Add a length-check handler and test no downstream invocation after rejection."),
  objectPattern("command", "Command", "behavioral",
    "Represent a requested operation as an object, separate from the invoker.",
    "Model intent explicitly and test the receiver without coupling it to a button or transport.",
    "Keep input in the command and work in its handler; durable execution and deduplication require additional mechanisms.",
    "Invoker -> command -> receiver/handler -> result",
    `record CancelOrder(Guid OrderId);
interface IOrderActions { Task CancelOwnedAsync(Guid id, string userId, CancellationToken ct); }
sealed class CancelHandler(IOrderActions orders) {
    public Task Handle(CancelOrder command, string userId, CancellationToken ct) =>
        orders.CancelOwnedAsync(command.OrderId, userId, ct);
}`,
    "An in-memory command object is not a durable queue and does not guarantee exactly-once execution.",
    "Test repeated cancellation under a defined idempotent business contract."),
  objectPattern("interpreter", "Interpreter", "behavioral",
    "Model a small grammar as expression objects whose meanings can be evaluated.",
    "Compose a constrained rule language without executing arbitrary submitted code.",
    "Define a tiny typed grammar, evaluate its tree, and bound size and depth when parsing untrusted input.",
    "Typed rule tree + input -> recursive evaluation -> decision",
    `interface IRule { bool Match(decimal total); }
sealed record AtLeast(decimal Minimum) : IRule {
    public bool Match(decimal total) => total >= Minimum;
}
sealed record Both(IRule Left, IRule Right) : IRule {
    public bool Match(decimal total) => Left.Match(total) && Right.Match(total);
}
IRule rule = new Both(new AtLeast(50m), new AtLeast(100m));`,
    "Do not replace a tiny grammar with eval or an unrestricted C# scripting engine for user input.",
    "Add an Or rule, test boundary totals, and define a maximum accepted rule-tree depth."),
  objectPattern("iterator", "Iterator", "behavioral",
    "Traverse a collection through a sequence contract without exposing its storage representation.",
    "Keep callers independent of how a batch stores or filters its items.",
    "Use C# sequence contracts and yield for local traversal; define lifetime, mutation, and enumeration behavior.",
    "Caller -> iterator -> next eligible item -> completion",
    `sealed class PositiveBatch(IEnumerable<int> source) {
    public IEnumerable<int> Values() {
        foreach (var value in source)
            if (value > 0) yield return value;
    }
}
foreach (var value in new PositiveBatch(new[] { -1, 2, 3 }).Values())
    Console.WriteLine(value);`,
    "Deferred enumeration can repeat expensive work or outlive an owned database context.",
    "Enumerate twice with an instrumented source and explain when materialization is appropriate."),
  objectPattern("mediator", "Mediator", "behavioral",
    "Centralize a focused interaction protocol so participating components do not depend directly on one another.",
    "Coordinate local checkout steps without every component referencing every other component.",
    "Keep the mediator scoped to a use case and distinguish local coordination from a durable saga.",
    "Participant request -> mediator -> suitable participant -> outcome",
    `interface IStockCheck { bool Available(string sku); }
interface ICartActions { void Add(string sku); }
sealed class CartMediator(IStockCheck stock, ICartActions cart) {
    public bool Add(string sku) {
        if (!stock.Available(sku)) return false;
        cart.Add(sku);
        return true;
    }
}`,
    "A check followed by a write does not reserve stock atomically, especially across services.",
    "Test component interactions and explain how a real inventory reservation changes this example."),
  objectPattern("memento", "Memento", "behavioral",
    "Capture and restore an originator's state through an owned snapshot.",
    "Implement local draft undo without exposing mutable internal state.",
    "Create immutable snapshots and restore only states that satisfy current rules; define retention of sensitive values.",
    "Originator -> snapshot -> local edits -> validated restore",
    `sealed record DraftSnapshot(string Title);
sealed class Draft {
    public string Title { get; private set; } = "";
    public void Rename(string title) => Title = title.Trim();
    public DraftSnapshot Save() => new(Title);
    public void Restore(DraftSnapshot snapshot) => Rename(snapshot.Title);
}`,
    "Restoring a local snapshot cannot undo a sent email, committed payment, or another user's concurrent write.",
    "Add a bounded undo stack and explain what changes if drafts are edited concurrently."),
  objectPattern("observer", "Observer", "behavioral",
    "Notify registered in-process subscribers when an observable subject changes.",
    "Decouple a local state change from optional UI notifications.",
    "Define subscriber lifetime and exception behavior; unsubscribe when ownership ends.",
    "Subject change -> current subscribers -> local reactions",
    `sealed class Progress {
    public event Action<int>? Changed;
    public void Report(int percent) => Changed?.Invoke(percent);
}
var progress = new Progress();
Action<int> show = value => Console.WriteLine(value);
progress.Changed += show;
try { progress.Report(50); }
finally { progress.Changed -= show; }`,
    "A subscriber exception can stop later callbacks; events are not durable cross-service delivery.",
    "Test unsubscription and define whether observer failures should stop the originating operation."),
  objectPattern("state", "State", "behavioral",
    "Delegate behavior to an object representing the current lifecycle state.",
    "Make permitted order actions explicit instead of scattering status checks.",
    "Give each state allowed operations and guard transitions; persistence needs an expected-version or equivalent concurrency contract.",
    "Current state + action -> allowed transition -> new state",
    `interface IOrderState { IOrderState Confirm(); }
sealed class DraftOrder : IOrderState {
    public IOrderState Confirm() => new ConfirmedOrder();
}
sealed class ConfirmedOrder : IOrderState {
    public IOrderState Confirm() => this; // Defined as idempotent.
}
sealed class Order {
    private IOrderState state = new DraftOrder();
    public void Confirm() => state = state.Confirm();
}`,
    "A state object stored only in process memory does not survive restart or protect concurrent writers.",
    "Add cancellation rules and test transitions before and after confirmation."),
  objectPattern("strategy", "Strategy", "behavioral",
    "Encapsulate interchangeable algorithms behind one contract selected by context.",
    "Change a pricing rule without changing the order workflow.",
    "Validate strategy configuration, keep currency/rounding policy explicit, and select trusted rules on the server.",
    "Context -> selected algorithm -> calculation -> result",
    `interface IDiscount { decimal Apply(decimal amount); }
sealed class PercentageDiscount : IDiscount {
    private readonly decimal percent;
    public PercentageDiscount(decimal percent) {
        if (percent is < 0m or > 100m) throw new ArgumentOutOfRangeException(nameof(percent));
        this.percent = percent;
    }
    public decimal Apply(decimal amount) => decimal.Round(amount * (100m - percent) / 100m, 2, MidpointRounding.AwayFromZero);
}`,
    "Do not let a client choose its own payable discount or treat this two-decimal example as every currency's policy.",
    "Compare no-discount and percentage strategies; test 0%, 50%, 100%, and rounding boundaries."),
  objectPattern("template-method", "Template Method", "behavioral",
    "Keep an algorithm's sequence fixed while subclasses supply selected steps.",
    "Preserve validation-before-rendering across several local export formats.",
    "Put the invariant sequence in a non-overridden operation and expose only deliberate hooks.",
    "Fixed operation -> validation -> variable step -> final result",
    `abstract class LocalExporter {
    public string Export(string value) {
        if (string.IsNullOrWhiteSpace(value)) throw new ArgumentException("Value required.");
        return Render(value);
    }
    protected abstract string Render(string value);
}
sealed class JsonExporter : LocalExporter {
    protected override string Render(string value) => System.Text.Json.JsonSerializer.Serialize(value);
}`,
    "Inheritance can create fragile coupling; Strategy is often simpler when only one algorithm varies.",
    "Add a second renderer and prove it cannot bypass the validation sequence."),
  objectPattern("visitor", "Visitor", "behavioral",
    "Add operations over a stable set of element types through double dispatch.",
    "Calculate different reports without embedding each operation in every line type.",
    "Give elements an Accept method and visitors a method per concrete type; weigh the cost when element types change often.",
    "Element.Accept -> visitor overload for concrete type -> operation result",
    `interface ILine { decimal Accept(ILineVisitor visitor); }
interface ILineVisitor { decimal Visit(ProductLine line); decimal Visit(ShippingLine line); }
sealed record ProductLine(decimal Amount) : ILine {
    public decimal Accept(ILineVisitor visitor) => visitor.Visit(this);
}
sealed record ShippingLine(decimal Amount) : ILine {
    public decimal Accept(ILineVisitor visitor) => visitor.Visit(this);
}
sealed class TotalVisitor : ILineVisitor {
    public decimal Visit(ProductLine line) => line.Amount;
    public decimal Visit(ShippingLine line) => line.Amount;
}`,
    "Adding an element type requires updating visitors; exposing element internals can weaken encapsulation.",
    "Implement a visitor that totals only product lines and compare the trade-off with a simple switch."),
  distributedPattern("database-per-service", "Database per service and local transaction boundaries",
    "Each service owns its schema and write rules; separate databases or enforced logical separation prevent other services from editing its internals.",
    "Protect independent changes without pretending a local transaction spans another service.",
    "Expose owned operations or events. The EF Core excerpt commits an order and an outbox intent in one local database; define OrderRow and OutboxRow in that service.",
    "Owned command -> local business rows + outbox -> commit -> independently delivered integration",
    `await using var transaction = await db.Database.BeginTransactionAsync(ct);
db.Orders.Add(new OrderRow { Id = orderId, Status = "Accepted" });
db.Outbox.Add(new OutboxRow { Id = eventId, Kind = "OrderAccepted", Payload = payload });
await db.SaveChangesAsync(ct);
await transaction.CommitAsync(ct);`,
    "A shared server is not itself the problem; ungoverned shared schemas and cross-service writes are.",
    "Crash after the commit and before publication. Show how a relay discovers the still-pending event."),
  distributedPattern("outbox-inbox-code", "Transactional outbox and idempotent consumer: SQL code lab",
    "An outbox durably captures outgoing intent with a business change; an inbox makes a repeated consumer-local transaction detectable.",
    "Make duplicate delivery safe without a false exactly-once network promise.",
    "In SQL Server, define Inbox with a unique key on (ConsumerName, MessageId). Insert the inbox key and apply the owned business update in one transaction. A duplicate-key rejection rolls back this attempt; a handler must then inspect the previously committed outcome and acknowledge only an actual already-processed message.",
    "Message -> unique inbox insert + owned change -> local commit -> acknowledge",
    `SET XACT_ABORT ON;
BEGIN TRANSACTION;
INSERT INTO Inbox(ConsumerName, MessageId) VALUES (@ConsumerName, @MessageId);
UPDATE Invoices SET OrderAccepted = 1 WHERE OrderId = @OrderId;
IF @@ROWCOUNT <> 1 THROW 51000, 'Expected one invoice', 1;
COMMIT TRANSACTION;
-- Acknowledge only after commit; classify duplicate-key errors separately.`,
    "A process-memory HashSet or a separate deduplication commit does not protect the durable effect.",
    "Run two concurrent deliveries and simulate a crash after commit but before broker acknowledgement.",
    "https://learn.microsoft.com/en-us/azure/architecture/databases/guide/transactional-out-box-cosmos"),
  distributedPattern("saga-code", "Saga orchestration and compensation: transition code",
    "A saga persists a workflow across independently committed steps and schedules compensating business actions when appropriate.",
    "Handle failed and unknown outcomes without erasing history or blindly charging again.",
    "Keep state, version checks, and outgoing intent in the same local transaction. The function below only chooses the next state; a durable coordinator must persist and dispatch it. A timeout is not proof of a declined payment.",
    "Current state + matched participant outcome -> new state + durable outgoing intent",
    `enum SagaState { Reserved, PaymentUnknown, Confirmed, ReleasePending, Review }
enum PaymentOutcome { Approved, Declined, TimedOut }
static SagaState Next(SagaState state, PaymentOutcome outcome) => (state, outcome) switch {
    (SagaState.Reserved, PaymentOutcome.Approved) => SagaState.Confirmed,
    (SagaState.Reserved, PaymentOutcome.Declined) => SagaState.ReleasePending,
    (SagaState.Reserved, PaymentOutcome.TimedOut) => SagaState.PaymentUnknown,
    _ => SagaState.Review
};`,
    "Release, void, and refund operations can fail and need durable identities and their own recovery.",
    "Add late approval, cancellation, and failed compensation; reject stale transitions using an expected version.",
    "https://learn.microsoft.com/en-us/azure/architecture/patterns/saga"),
  distributedPattern("cqrs-code", "CQRS: separate command and query code",
    "Commands express intended state changes; queries return appropriate views without making that business change.",
    "Use different models for write invariants and screen-shaped reads without requiring two databases.",
    "Put validation and authorization in the command handler. Project the query to a read DTO; if a separate projection is asynchronous, state its freshness and rebuild contract. The EF Core query below uses the same store and still checks ownership.",
    "Command -> write model; query -> authorized read projection",
    `record ConfirmOrder(Guid OrderId);
record OrderSummary(Guid Id, string Status);
var summaries = await db.Orders.AsNoTracking()
    .Where(order => order.CustomerId == currentCustomerId)
    .OrderBy(order => order.Id)
    .Select(order => new OrderSummary(order.Id, order.Status))
    .Take(25).ToListAsync(ct);
// ConfirmOrder is handled separately through invariant-protecting behavior.`,
    "Do not authorize a new write using a stale projection, and do not assume CQRS requires event sourcing.",
    "Introduce projection lag and define what the UI displays immediately after confirming an order.",
    "https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs"),
  distributedPattern("resilience-code", "Circuit breaker, retry, timeout and bulkhead: code boundaries",
    "Resilience policies separately limit waiting, eligible repeated attempts, calls during failure, and concurrent resource use.",
    "Keep a slow optional dependency from consuming every request slot.",
    "This .NET excerpt demonstrates only a local bulkhead and deadline, not a complete circuit breaker. Define one shared per-dependency SemaphoreSlim with a capacity chosen from measured downstream limits. Use a resilience library's explicit closed/open/half-open policy when implementing a real breaker. Retry only replay-safe operations within the original deadline.",
    "Try admission -> bounded operation -> release capacity -> controlled outcome",
    `// Shared field: readonly SemaphoreSlim slots = new(8, 8);
if (!await slots.WaitAsync(0, requestAborted))
    return Results.StatusCode(503);
try {
    using var budget = CancellationTokenSource.CreateLinkedTokenSource(requestAborted);
    budget.CancelAfter(TimeSpan.FromSeconds(2));
    using var reply = await catalog.GetAsync("/public-items", budget.Token);
    return Results.StatusCode((int)reply.StatusCode);
}
finally { slots.Release(); }`,
    "A breaker is not a concurrency limit; do not retry an uncertain payment merely because it timed out.",
    "Hold all eight slots with slow responses and verify the ninth request rejects promptly without leaking a slot.",
    "https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker"),
  distributedPattern("gateway-code", "API gateway and BFF: authorized aggregation code",
    "A gateway handles ingress routing and selected edge policies; a BFF shapes calls for one client experience.",
    "Compose one screen without moving all domain invariants into the gateway.",
    "Authorize the required order first. Fetch optional recommendations under a small separate budget and report their absence explicitly. The named clients enforce server identity, bounded HTTP lifetimes, and their own receiving-service authorization.",
    "Client -> owned order -> optional recommendations -> explicit composed view",
    `var order = await orders.GetOwnedAsync(userId, orderId, requestAborted);
using var optional = CancellationTokenSource.CreateLinkedTokenSource(requestAborted);
optional.CancelAfter(TimeSpan.FromMilliseconds(300));
Recommendation[] suggestions = Array.Empty<Recommendation>();
bool recommendationsAvailable = true;
try { suggestions = await catalog.RecommendAsync(order.Id, optional.Token); }
catch (OperationCanceledException) when (!requestAborted.IsCancellationRequested) {
    recommendationsAvailable = false;
}
return Results.Ok(new { order, suggestions, recommendationsAvailable });`,
    "Optional-data fallback is not permission to invent order acceptance, stock, or payment success.",
    "Test that an unauthorized order never triggers a catalog request and that caller cancellation is preserved.",
    "https://learn.microsoft.com/en-us/azure/architecture/patterns/gateway-aggregation"),
  distributedPattern("circuit-breaker-code", "Retry and Circuit Breaker: a configured .NET HTTP pipeline",
    "A circuit breaker observes failures, opens to reject calls for a period, and permits controlled recovery probes. A retry is a separate repeated attempt.",
    "Use a maintained HTTP resilience implementation rather than an incomplete home-grown breaker.",
    "In an ASP.NET Core lab, reference Microsoft.Extensions.Http.Resilience and import its extension namespace plus Microsoft.Extensions.DependencyInjection. Configure one standard handler for this client, not stacked copies. These small sample budgets are educational, not measured production settings. Disable unsafe-method retries; a read endpoint must really be read-only. Propagate caller cancellation and monitor breaker transitions.",
    "Shared client policy -> total budget -> eligible retry -> breaker -> per-attempt timeout",
    `builder.Services.AddHttpClient("catalog", client => {
    client.BaseAddress = new Uri("https://catalog.example.test");
    client.Timeout = Timeout.InfiniteTimeSpan;
}).AddStandardResilienceHandler(options => {
    options.TotalRequestTimeout.Timeout = TimeSpan.FromSeconds(5);
    options.AttemptTimeout.Timeout = TimeSpan.FromSeconds(2);
    options.Retry.MaxRetryAttempts = 1;
    options.Retry.Delay = TimeSpan.FromMilliseconds(150);
    options.Retry.UseJitter = true;
    options.Retry.DisableForUnsafeHttpMethods();
    options.CircuitBreaker.FailureRatio = 0.5;
    options.CircuitBreaker.MinimumThroughput = 8;
    options.CircuitBreaker.SamplingDuration = TimeSpan.FromSeconds(20);
    options.CircuitBreaker.BreakDuration = TimeSpan.FromSeconds(10);
});`,
    "Minimum throughput means a low-traffic client may not open after one failure; a breaker is not a guaranteed outage detector.",
    "Use a fake HTTP handler and a controllable clock to test transient GET failure, non-retried POST, open rejection and recovery probes.",
    "https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience"),
  distributedPattern("event-sourcing-code", "Event Sourcing: pure state reconstruction",
    "An ordered persisted stream of domain facts is the source of state; a pure reducer reconstructs that state without invoking external effects.",
    "Inspect historical transitions without replaying payments or emails.",
    "Keep stream identity and expected-version append in the event-store contract. The local reducer below rejects invalid transitions, while a production store must atomically enforce stream version. Integration publication and rebuildable read projections are separate responsibilities. Define schema evolution, sensitive-data handling and snapshot versioning before adoption.",
    "Ordered stored events -> pure reducer -> reconstructed state -> expected-version append",
    `abstract record OrderEvent;
sealed record OrderPlaced(decimal Total) : OrderEvent;
sealed record OrderConfirmed : OrderEvent;
sealed record OrderView(decimal Total, bool Confirmed);
static OrderView Evolve(OrderView? state, OrderEvent next) => (state, next) switch {
    (null, OrderPlaced placed) when placed.Total > 0m => new(placed.Total, false),
    (OrderView { Confirmed: false } current, OrderConfirmed _) => current with { Confirmed = true },
    _ => throw new InvalidOperationException("Invalid event sequence.")
};
// In a test/Main: fold a stored, version-checked stream through Evolve.
// No HTTP calls, email sends, or payment captures belong in this reducer.`,
    "A broker log alone is not an event-sourcing implementation, and a snapshot does not replace compatibility with old events.",
    "Replay placement plus confirmation twice into fresh state, reject confirmation before placement, and test competing expected-version appends.",
    "https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing"),
  distributedPattern("idempotency-code", "Idempotency keys and canonical request fingerprints",
    "A scoped operation identity lets a caller retry the same intended operation and recover its recorded result without repeating its local effect.",
    "Distinguish a repeated request from a different purchase reusing the same key.",
    "Authenticate first, validate a bounded key, and hash canonical validated business input on the server. CreateOrderOnceAsync below is a persistence contract: it must atomically enforce a unique (customer,key), compare the stored request hash, and commit the order plus saved response and outbox intent. A pre-read alone is not concurrency protection. External payment operations need their own provider key and reconciliation.",
    "Authenticated input + scoped key -> compare fingerprint -> atomic first effect or recorded result",
    `var existing = await operations.FindOwnedAsync(customerId, key, ct);
if (existing is not null) {
    if (existing.RequestHash != requestHash) return Results.Conflict();
    return Results.Ok(existing.Response);
}
// Contract handles a concurrent creator using the same unique key:
var result = await operations.CreateOrderOnceAsync(
    customerId, key, requestHash, validatedRequest, ct);
return Results.Ok(result);`,
    "An in-memory dictionary loses history on restart; deduplication retention bounds how long the promise holds.",
    "Send two concurrent identical requests, then reuse the key with a changed amount. Verify one order and a conflict for the changed request."),
  distributedPattern("cache-aside", "Cache-aside: scoped keys and freshness",
    "A read checks a derived cache first and loads the authoritative source on a miss.",
    "Reduce repeated read cost while declaring staleness and cache-outage behavior.",
    "Authorize before cache access, include tenant identity in the key, and bound lifetime and size. The example uses an injected cache contract; it does not promise atomic population or automatic invalidation. Do not use a cache to decide paid access or guaranteed stock.",
    "Authorization -> tenant-scoped key -> cached value or source read -> bounded cache write",
    `await access.RequireTenantAsync(user, tenantId, ct);
var key = $"catalog:{tenantId}:product:{productId}";
var item = await cache.GetAsync<ProductView>(key, ct);
if (item is null) {
    item = await catalog.LoadAsync(tenantId, productId, ct);
    if (item is not null) await cache.SetAsync(key, item, TimeSpan.FromMinutes(1), ct);
}
return item;`,
    "A concurrent write can race a cache fill; TTL does not eliminate every stale-read window.",
    "Test two tenants with identical product IDs, then trace a write racing a cache miss.",
    "https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside"),
  distributedPattern("pubsub-choreography", "Publish-subscribe, choreography and competing consumers",
    "A topic distributes an event to independent subscriptions; workers sharing one subscription compete for its work.",
    "Allow Billing and Analytics to react independently without every replica repeating the same responsibility.",
    "Publish a versioned integration contract through an outbox. Configure separate subscriptions for distinct consumers; use idempotent local effects and acknowledge only after commit. Choreography lets participants react rather than follow one central orchestrator, but workflow ownership and failure recovery remain necessary.",
    "Outbox -> topic -> Billing subscription / Analytics subscription -> bounded competing workers",
    `record OrderAccepted(Guid EventId, Guid OrderId, int SchemaVersion);
async Task HandleAsync(OrderAccepted message, CancellationToken ct) {
    // This contract commits a unique inbox key and the billing effect together.
    await billingInbox.ApplyOnceAsync("billing", message.EventId,
        message.OrderId, ct);
    // The broker adapter acknowledges only after this handler completes.
}`,
    "In-process C# events are not a durable substitute, and a chain of reactions still needs business observability.",
    "Run two workers for Billing and one for Analytics; verify one committed Billing effect and one Analytics effect per event.",
    "https://learn.microsoft.com/en-us/azure/architecture/patterns/publisher-subscriber"),
  distributedPattern("strangler-acl", "Strangler Fig and anti-corruption layer",
    "Route a bounded capability to a replacement while translating old contracts at an explicit model boundary.",
    "Migrate incrementally without forcing a complete rewrite or adopting a legacy model everywhere.",
    "Select one capability and its authoritative writer, define rollback and data synchronization, then gradually switch compatible traffic. Translate legacy units and names through a validated adapter. The local example illustrates translation, not a full migration router.",
    "Capability route -> legacy/new owner -> translation boundary -> local model",
    `record LegacyTotal(long Cents, string Currency);
record Money(decimal Amount, string Currency);
static Money Translate(LegacyTotal value) {
    if (value.Currency != "USD" || value.Cents < 0)
        throw new InvalidOperationException("Unsupported legacy total.");
    return new Money(value.Cents / 100m, value.Currency);
}`,
    "Uncoordinated dual writes can diverge; routing traffic does not migrate or reconcile authoritative data by itself.",
    "Migrate order history reads first, then specify how write ownership and rollback differ.",
    "https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig"),
  distributedPattern("async-request-reply", "Asynchronous request-reply and polling",
    "Accept long-running work durably, return a status resource, and let an authorized caller observe completion.",
    "Avoid holding one HTTP connection open for an unbounded export.",
    "Authorize the request and persist work before returning 202. The export service contract below atomically stores a tenant-owned job and its dispatch intent. A status endpoint must recheck ownership and use an explicit pending/completed/failed contract; returning 202 is not proof of completion.",
    "Authorized POST -> durable job + dispatch intent -> 202 status URL -> authorized polling",
    `app.MapPost("/exports", async (ExportRequest request, IExportJobs jobs,
    ClaimsPrincipal user, CancellationToken ct) => {
    var job = await jobs.AcceptOwnedAsync(user, request, ct);
    return Results.Accepted($"/exports/{job.Id}", new { job.Id, status = "pending" });
}).RequireAuthorization();
// GET /exports/{id}: authorize ownership, return persisted status;
// provide a download URL only after the actual output exists.`,
    "Do not start fire-and-forget request-local work and call it a durable job.",
    "Restart the worker after acceptance, poll as a different user, and test stale or expired download links.",
    "https://learn.microsoft.com/en-us/azure/architecture/patterns/async-request-reply"),
  distributedPattern("sidecar", "Sidecar and Ambassador: deployment-level collaboration",
    "A sidecar runs a helper beside an application; an ambassador specializes in proxying calls to external services.",
    "Separate selected operational behavior without claiming the helper owns business authorization.",
    "Define the shared lifecycle and resource limits. The Kubernetes deployment-spec excerpt shows two containers in one Pod; replace illustrative image tags with reviewed pinned digests and add probes, identity, network policy and secret injection before deployment.",
    "Application container -> local helper -> permitted remote dependency",
    `# Excerpt under a Deployment's spec.template.spec:
containers:
  - name: orders
    image: example/orders:reviewed
    resources:
      limits: { memory: "256Mi", cpu: "500m" }
  - name: outbound-proxy
    image: example/proxy:reviewed
    resources:
      limits: { memory: "128Mi", cpu: "250m" }
# Define ports, startup/readiness and least-privilege configuration separately.`,
    "Containers share a failure/resource environment; a sidecar does not make an unsafe downstream write idempotent.",
    "Kill the helper in a local lab and define what readiness, in-flight requests and retries should do.",
    "https://learn.microsoft.com/en-us/azure/architecture/patterns/sidecar"),
];
