(function (root, factory) {
  const paths = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = paths;
  else root.KR7ConceptPaths = paths;
})(globalThis, () => {
  "use strict";

  // Public navigation metadata only; full explanations stay behind /api/concepts.
  const PATHS = {
    "Angular + .NET Fullstack": {
      prerequisite: "Basic computer use. Learn HTML/CSS, TypeScript, C#, HTTP, and SQL alongside the foundation stage in a separate local lab.",
      goal: "Follow the 0-5 year cluster: foundations, feature delivery, then reliable production behavior through one Angular + ASP.NET Core project.",
      lessonIds: ["fullstack-foundation-web", "fullstack-foundation-types", "fullstack-foundation-components",
        "fullstack-foundation-csharp", "fullstack-foundation-api", "fullstack-foundation-data",
        "fullstack-delivery-contracts", "fullstack-delivery-rxjs", "fullstack-delivery-forms",
        "fullstack-delivery-routing", "fullstack-delivery-identity", "fullstack-delivery-testing",
        "fullstack-production-performance", "fullstack-production-concurrency", "fullstack-production-reliability",
        "fullstack-production-design", "fullstack-production-delivery", "fullstack-production-capstone"],
    },
    "C#": {
      prerequisite: "Basic variables, conditions, and functions.",
      goal: "Build a precise language model before moving into web application development.",
      lessonIds: ["cs-type-system", "cs-generics-variance", "cs-records-patterns", "cs-delegates-events", "cs-async"],
    },
    ".NET": {
      prerequisite: "C# types, async basics, and introductory HTTP.",
      goal: "Move from runtime and application startup to secure APIs, diagnostics, testing, and deployment.",
      lessonIds: ["net-runtime-memory", "net-host-options", "net-di", "net-pipeline", "net-api-contracts",
        "net-problem-details", "net-jwt-policies", "net-httpclient", "net-workers-channels", "net-cache-layers",
        "net-telemetry", "net-performance", "net-integration-tests", "net-health-shutdown"],
    },
    "EF Core & LINQ": {
      prerequisite: "C# collections, async, and basic relational data.",
      goal: "Understand query execution before tuning loading, evolving schemas, and recovering conflicting writes.",
      lessonIds: ["data-linq", "data-ef", "ef-loading-projection", "ef-model-migrations", "ef-concurrency-recovery"],
    },
    "Microservices": {
      prerequisite: "HTTP APIs, database transactions, and one working application.",
      goal: "Learn boundaries and reliable workflows, then all 23 GoF design patterns and distributed-pattern code labs. Distinguish service-internal object design from cross-service guarantees.",
      lessonIds: ["micro-boundaries", "micro-ddd-aggregates", "micro-contract-evolution", "micro-discovery",
        "micro-gateway-bff", "micro-resilience", "micro-consistency", "micro-broker-delivery",
        "micro-outbox-inbox", "micro-saga-state-machine", "micro-event-order-replay",
        "micro-bulkhead-backpressure", "micro-reconciliation", "micro-cqrs", "micro-event-sourcing",
        "micro-workload-security", "micro-strangler", "micro-pattern-map",
        "micro-pattern-factory-method", "micro-pattern-abstract-factory", "micro-pattern-builder",
        "micro-pattern-prototype", "micro-pattern-singleton", "micro-pattern-adapter",
        "micro-pattern-bridge", "micro-pattern-composite", "micro-pattern-decorator",
        "micro-pattern-facade", "micro-pattern-flyweight", "micro-pattern-proxy",
        "micro-pattern-chain-of-responsibility", "micro-pattern-command", "micro-pattern-interpreter",
        "micro-pattern-iterator", "micro-pattern-mediator", "micro-pattern-memento",
        "micro-pattern-observer", "micro-pattern-state", "micro-pattern-strategy",
        "micro-pattern-template-method", "micro-pattern-visitor",
        "micro-pattern-database-per-service", "micro-pattern-outbox-inbox-code",
        "micro-pattern-saga-code", "micro-pattern-cqrs-code", "micro-pattern-resilience-code",
        "micro-pattern-gateway-code", "micro-pattern-circuit-breaker-code", "micro-pattern-event-sourcing-code",
        "micro-pattern-idempotency-code", "micro-pattern-cache-aside", "micro-pattern-pubsub-choreography",
        "micro-pattern-strangler-acl", "micro-pattern-async-request-reply", "micro-pattern-sidecar"],
    },
    "System Design": {
      prerequisite: "HTTP, databases, and basic application architecture.",
      goal: "Progress from enterprise HLD and data/cache decisions through Redis, practical system designs, and detailed LLD collaborations.",
      lessonIds: ["design-requirements-slo", "design-enterprise-hld", "design-capacity", "design-data-model",
        "design-consistency", "redis-data-model", "redis-cache-aside-races", "redis-expiry-eviction",
        "design-cache-stampede", "redis-atomic-operations", "redis-replication-cluster", "redis-leases-fencing",
        "design-partition-sharding", "design-rate-limits", "design-idempotent-orders",
        "design-notifications", "design-url-shortener", "design-multitenancy", "design-disaster-recovery",
        "design-ecommerce-hld", "design-booking-hld", "design-payment-hld", "design-chat-hld",
        "design-feed-hld", "design-files-hld", "design-search-hld", "lld-solid-composition",
        "lld-pattern-selection", "lld-domain-model", "lld-state-machines", "lld-repository-uow",
        "lld-parking-lot", "lld-pricing-engine", "lld-job-scheduler"],
    },
    "Azure": {
      prerequisite: "Application hosting, HTTP, identity basics, and a cost-aware isolated lab.",
      goal: "Learn resource boundaries, identity, data access, messaging, and durable workflows in that order.",
      lessonIds: ["azure-hosting", "azure-key-vault", "azure-blob-upload", "azure-messaging", "azure-durable-functions"],
    },
    "SQL": {
      prerequisite: "Tables, rows, keys, and basic SELECT syntax.",
      goal: "Write correct queries first, then protect concurrent writes, coordinate work, and choose replica freshness deliberately.",
      lessonIds: ["sql-querying", "sql-transactions", "sql-isolation-anomalies", "sql-conditional-inventory",
        "sql-unique-idempotency", "sql-work-claims", "sql-plans-sargability", "sql-procedures-parameters",
        "sql-deadlock-recovery", "sql-replica-read-consistency"],
    },
    "Angular": {
      prerequisite: "HTML, CSS, JavaScript/TypeScript, and basic HTTP.",
      goal: "Build components and state ownership before routing, request lifecycles, and validated forms.",
      lessonIds: ["angular-components", "angular-di-lifecycle", "angular-routing", "angular-http", "angular-form-validation"],
    },
    "AI": {
      prerequisite: "Basic Python, functions, JSON, HTTP, and async concepts. Start with fake providers; paid inference is optional.",
      goal: "Learn model boundaries and retrieval, compose LangChain components, then build explicit LangGraph workflows.",
      lessonIds: ["ai-model-foundations", "ai-prompt-composition", "ai-langchain-components",
        "ai-hybrid-retrieval", "ai-rag", "ai-langchain-retrievers", "ai-langchain-tools", "ai-agents",
        "ai-langchain-memory", "ai-langgraph-state", "ai-langgraph-routing", "ai-langgraph-checkpoints",
        "ai-langgraph-approvals", "ai-langgraph-streaming", "ai-injection-boundaries",
        "ai-evaluation-regression", "ai-langgraph-capstone"],
    },
    "JavaScript / TypeScript": {
      prerequisite: "Variables, functions, arrays, objects, and browser basics.",
      goal: "Understand execution and state before relying on static contracts and generic helpers.",
      lessonIds: ["js-event-loop", "js-asynchrony", "js-copy-immutability", "ts-contracts", "ts-generics-keyof"],
    },
    "DevOps": {
      prerequisite: "One small application and an isolated local lab. No production access or cloud spending is needed to read the path.",
      goal: "Follow steps 1-12 from Linux to operating a release, then deepen delivery, infrastructure, and supply-chain knowledge.",
      lessonIds: ["devops-linux", "devops-shell", "devops-network", "devops-git", "devops-builds",
        "devops-docker", "devops-compose", "devops-kubernetes", "devops-k8s-network-config",
        "devops-terraform-lab", "devops-pipeline-lab", "devops-observability-sre", "devops-delivery",
        "devops-operations", "devops-iac-state", "devops-supply-chain", "devops-release-strategies"],
    },
    "Identity & Security": {
      prerequisite: "HTTP requests, cookies, application data, and trust boundaries.",
      goal: "Separate identity from permission, then apply safe web-session and browser-request controls.",
      lessonIds: ["security-access", "security-oauth-oidc", "security-web", "security-csrf-cors"],
    },
    "Testing": {
      prerequisite: "Functions, HTTP boundaries, and a small application with observable behavior.",
      goal: "Choose useful boundaries, broaden inputs, protect contracts, and exercise failures deterministically.",
      lessonIds: ["testing-boundaries", "testing-properties", "testing-contracts", "testing-failures"],
    },
    "DSA": {
      prerequisite: "Arrays, loops, functions, maps, and basic complexity notation.",
      goal: "Learn invariants and complexity, then practice ordered search, priority structures, and traversal.",
      lessonIds: ["dsa-patterns", "dsa-binary-search", "dsa-heaps-topk", "dsa-traversal"],
    },
  };

  function orderLessons(category, lessons) {
    const ids = PATHS[category]?.lessonIds || [];
    const rank = new Map(ids.map((id, index) => [id, index]));
    return [...lessons].sort((a, b) => (rank.get(a.id) ?? ids.length) - (rank.get(b.id) ?? ids.length));
  }

  return { PATHS, orderLessons };
});
