# Warehouse Simulation Example

Models a warehouse receiving facility with multiple resources and multi-stage processes.

## Scenario

Trucks arrive at a warehouse and go through several stages:

1. **Dock Assignment**: Wait for an available loading dock
2. **Unloading**: Use a forklift to unload cargo (dock + forklift required)
3. **Inspection**: Quality inspection of cargo
4. **Storage**: Move cargo to storage location

Each stage requires specific resources, creating realistic contention patterns.

## Resources

- **Loading Docks** (2): Limited parking spots for trucks
- **Forklifts** (3): Equipment for unloading cargo
- **Inspectors** (2): Personnel for quality checks

## Process Flow

```
Truck Arrives
     |
     v
[Wait for Dock] -> Acquire Dock
     |
     v
[Wait for Forklift] -> Acquire Forklift + Unload (0.5h +/-0.1h)
     |
     v
Release Dock + Forklift
     |
     v
[Wait for Inspector] -> Acquire Inspector + Inspect (0.3h +/-0.05h)
     |
     v
Release Inspector
     |
     v
Store Cargo (0.2h +/-0.05h)
     |
     v
Truck Departs
```

## Running the Example

```bash
# From the examples/warehouse directory
npx tsx index.ts

# Or from the project root
npx tsx examples/warehouse/index.ts
```

## What It Demonstrates

1. **Multiple Resource Types**: Different resources with different capacities
2. **Multi-Stage Processes**: Sequence of dependent operations
3. **Resource Contention**: Multiple trucks competing for limited resources
4. **Bottleneck Analysis**: Identifying which resource limits throughput
5. **Time-Based Statistics**: Wait times, utilization, queue lengths

## Expected Output

```
============================================================
Warehouse Simulation
============================================================
Number of trucks: 50
Arrival rate: 0.2 trucks/hour
Loading docks: 2
Forklifts: 3
Inspectors: 2
Random seed: 123

Running simulation...
Simulation completed in XXXms
Simulated time: XXX.XX hours
Events processed: XXXX

============================================================
Simulation Results
============================================================

Throughput:
  Trucks processed: 50
  Average time in system: X.XX hours

Loading Dock:
  Utilization: XX.X%
  Average wait time: X.XX hours
  Average queue length: X.XX

Forklift:
  Utilization: XX.X%
  Average wait time: X.XX hours
  Average queue length: X.XX

Inspector:
  Utilization: XX.X%
  Average wait time: X.XX hours
  Average queue length: X.XX

Wait Time Breakdown:
  Average dock wait: X.XX hours
  Average forklift wait: X.XX hours
  Average inspection wait: X.XX hours

============================================================
Bottleneck Analysis
============================================================

Resource Utilization (sorted):
  Loading Dock     XX.X% ############################
  Forklift         XX.X% ####################
  Inspector        XX.X% ###############

[WARNING] BOTTLENECK: Loading Dock is heavily utilized (XX.X%)
   Consider adding more Loading Dock resources.

============================================================
```

## Key Parameters

```typescript
const NUM_TRUCKS = 50;
const TRUCK_ARRIVAL_RATE = 0.2;  // trucks per hour
const NUM_LOADING_DOCKS = 2;
const NUM_FORKLIFTS = 3;
const NUM_INSPECTORS = 2;

// Process times (hours)
const UNLOAD_TIME_MEAN = 0.5;
const INSPECTION_TIME_MEAN = 0.3;
const STORAGE_TIME_MEAN = 0.2;
```

## Experimentation Ideas

Try modifying the parameters to explore different scenarios:

### Scenario 1: Increased Traffic
```typescript
const NUM_TRUCKS = 100;
const TRUCK_ARRIVAL_RATE = 0.5;  // More trucks arriving faster
```
**Expected**: Higher wait times, bottlenecks become more severe

### Scenario 2: Add Resources
```typescript
const NUM_LOADING_DOCKS = 3;  // Add one more dock
const NUM_FORKLIFTS = 4;      // Add one more forklift
```
**Expected**: Reduced wait times, better throughput

### Scenario 3: Faster Inspection
```typescript
const INSPECTION_TIME_MEAN = 0.15;  // Half the inspection time
```
**Expected**: Inspector utilization drops, bottleneck shifts

### Scenario 4: Bottleneck Test
```typescript
const NUM_INSPECTORS = 1;  // Reduce to single inspector
```
**Expected**: Inspection becomes severe bottleneck

## What You Learn

This example teaches:

1. **Resource Allocation**: How to balance different resource capacities
2. **Bottleneck Identification**: Finding which resource limits system throughput
3. **Process Optimization**: Understanding where to invest in improvements
4. **Multi-Stage Workflows**: Modeling complex processes with dependencies

## Real-World Applications

This pattern applies to:
- Manufacturing facilities (workstations as resources)
- Healthcare (exam rooms, equipment, staff)
- Call centers (agents, specialists, supervisors)
- Transportation hubs (gates, baggage handlers, security)
- Computer systems (CPU, memory, I/O resources)

## Extending This Example

Try adding:
- **Priority trucks**: Express shipments that skip the queue
- **Resource breakdowns**: Forklifts that fail and need repair
- **Shift schedules**: Different resource availability by time of day
- **Cargo size variation**: Some trucks need multiple forklifts
- **Storage capacity limits**: Warehouse can get full
