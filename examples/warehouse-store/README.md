# Warehouse Distribution Center Simulation

A discrete-event simulation of a distribution warehouse managing pallet inventory with multiple shipping strategies.

## Overview

This example demonstrates how to use the **Store** resource to model inventory systems with distinct objects (pallets). The simulation showcases:

- **Store Resource**: Managing distinct items with unique IDs
- **FIFO Retrieval**: First-in, first-out shipping
- **Filter-Based Retrieval**: Shipping by destination, priority
- **Multi-Strategy Shipping**: Regular, priority, and destination-specific routes
- **Resource Coordination**: Forklifts (Resource) + Warehouse (Store)

## Scenario

A distribution warehouse operates for 48 hours with:
- **Warehouse Capacity**: 100 pallets
- **Forklifts**: 3 units (shared Resource)
- **Receiving Rate**: ~5 pallets/hour
- **Shipping Rate**: ~4.5 pallets/hour
- **Destinations**: NYC, LA, CHI, MIA (with different priorities)

### Shipping Strategies

1. **Regular FIFO**: First-in, first-out (no filter)
2. **Priority Shipping**: High-priority pallets every 6 hours
3. **Destination Routes**: Scheduled routes to specific cities

## Key Concepts

### Store vs Buffer

| Feature | Store | Buffer |
|---------|-------|--------|
| **Stores** | Distinct objects (pallets) | Homogeneous quantity (fuel) |
| **Retrieval** | FIFO or filtered | Always quantity-based |
| **Use Case** | Inventory with SKUs | Bulk commodities |

### FIFO Retrieval (No Filter)

```typescript
// Get first pallet in warehouse (FIFO)
const request = warehouse.get();
yield request;
const pallet = request.retrievedItem!;
```

### Filtered Retrieval

```typescript
// Get pallet for specific destination
const request = warehouse.get(p => p.destination === 'NYC');
yield request;
const pallet = request.retrievedItem!;
console.log(`Shipping ${pallet.id} to NYC`);
```

### Filter by Priority

```typescript
// Get high-priority pallet
const request = warehouse.get(p => p.priority === 1);
yield request;
const pallet = request.retrievedItem!;
```

### Inspecting Store Contents

```typescript
// View all items (read-only)
const items = warehouse.items;

// Count by destination
const nycCount = items.filter(p => p.destination === 'NYC').length;

// Find heaviest pallet
const heaviest = items.reduce((a, b) =>
  a.weight > b.weight ? a : b
);
```

## Running the Example

```bash
# From the discrete-sim root directory
npx tsx examples/warehouse-store/index.ts

# Or compile and run with Node.js
npm run build
node examples/warehouse-store/index.js
```

## Sample Output

```
Starting Warehouse Distribution Simulation...

[0.15h] 📦 RECEIVING: Pallet P0001 for NYC (642kg, Priority 1)
[0.30h] ✓ STORED: Pallet P0001 (warehouse: 1/100)
[0.45h] 📦 RECEIVING: Pallet P0002 for LA (531kg, Priority 2)
[0.60h] ✓ STORED: Pallet P0002 (warehouse: 2/100)
[0.72h] 🚚 SHIP-FIFO: Waiting for any pallet...
[0.92h] 📤 SHIPPING: Pallet P0001 to NYC (waited 41.4min, warehouse: 1/100)
...

[8.00h] ⚡ PRIORITY BATCH: Found 12 priority 1 items

[8.15h] 🔥 PRIORITY: Shipping P0015 to CHI (P1, waited 245.2min)
...

[16.00h] 🚛 LA ROUTE: 8 pallets ready

[16.20h] 🎯 DEST: Shipping P0023 to LA (waited 512.5min)
...

======================================================================
WAREHOUSE DISTRIBUTION CENTER RESULTS
======================================================================
Simulation Duration: 48 hours

──────────────────────────────────────────────────────────────────────
WAREHOUSE OPERATIONS
──────────────────────────────────────────────────────────────────────
Warehouse Capacity: 100 pallets
Final Inventory: 34 pallets

Total Pallets Received: 245
Total Pallets Shipped: 211
Net Flow: 34 pallets

──────────────────────────────────────────────────────────────────────
PERFORMANCE METRICS
──────────────────────────────────────────────────────────────────────
Average Warehouse Occupancy: 28.5 pallets (28.5%)
Average Receiving Wait: 0.23 minutes
Average Shipping Wait: 45.67 minutes

──────────────────────────────────────────────────────────────────────
QUEUE STATISTICS
──────────────────────────────────────────────────────────────────────
Average Receiving Queue: 0.02
Average Shipping Queue: 1.85

──────────────────────────────────────────────────────────────────────
FORKLIFT UTILIZATION
──────────────────────────────────────────────────────────────────────
Number of Forklifts: 3
Forklift Utilization: 67.3%
Total Operations: 456
Average Wait for Forklift: 3.42 minutes

──────────────────────────────────────────────────────────────────────
INVENTORY BREAKDOWN
──────────────────────────────────────────────────────────────────────
Current Inventory by Destination:
  NYC: 9 pallets
  LA: 6 pallets
  CHI: 11 pallets
  MIA: 8 pallets
======================================================================
```

## Insights

### Filter Blocking Behavior

- **Get with filter blocks** until matching item is available
- Multiple filtered gets can wait simultaneously
- When item is added, all waiting filters are checked

### Priority vs FIFO

- **FIFO shipping**: Predictable, fair, simple
- **Priority shipping**: Strategic, reduces wait for important items
- **Destination routing**: Batches shipments, reduces costs

### Resource Coordination

This example shows **Store + Resource** integration:
1. Forklift (Resource) ensures limited concurrent operations
2. Warehouse (Store) manages distinct pallet inventory
3. Both resources work together seamlessly

## Experimentation Ideas

Try modifying parameters to explore different scenarios:

1. **Increase receiving rate** → Warehouse fills up, more blocking
2. **Add more forklifts** → Less waiting, higher throughput
3. **Change priority weights** → Different destination distributions
4. **Modify shipping strategies** → Balance FIFO vs filtered
5. **Add capacity constraints** → Study inventory management

## Comparison with Buffer Example

| Example | Resource Type | Items | Retrieval | Use Case |
|---------|--------------|-------|-----------|----------|
| **fuel-station** | Buffer | Fuel (gallons) | Quantity-based | Bulk commodity |
| **warehouse-store** | Store | Pallets (objects) | FIFO or filtered | SKU-based inventory |

## Related Examples

- `examples/fuel-station/` - Using Buffer for homogeneous quantities
- `examples/bank-tellers/` - Using Resource for discrete capacity
- `examples/hospital-emergency/` - Priority queues with Resource

## Learn More

- [Store API Reference](../../README.md#store)
- [Filter-Based Retrieval Guide](../../README.md#filter-based-retrieval)
- [Process-Based Modeling](../../GUIDE.md)
