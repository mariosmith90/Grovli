# Zustand Stores

This directory contains all the Zustand stores for state management.

## Migration to Zustand

The application has been migrated from React Context API to Zustand for state management, particularly for meal plan generation state. This change brings several benefits:

### Benefits of Zustand
1. **Single source of truth** - All meal plan state is now managed in one place
2. **Simplified debugging** - Improved logging with timestamps and sequence numbers
3. **Better persistence** - Using Zustand's persist middleware for reliable localStorage storage
4. **Hydration awareness** - Prevents React hydration errors (#310) by tracking hydration state
5. **Atomic updates** - All state changes happen atomically through actions
6. **No providers needed** - Zustand doesn't require context providers
7. **Job tracking** - Implemented proper tracking of meal generation jobs with unique IDs

### Compatibility Layer
To ensure backward compatibility with existing code that uses localStorage directly, we've implemented a helper layer in `mealStoreHelpers` that:

- Redirects localStorage get/set operations to use Zustand
- Maintains backward compatibility with existing code
- Ensures synchronization between localStorage and Zustand state

### Best Practices
1. Always use the Zustand hooks (`useMealStore`) instead of direct localStorage access
2. For component local state, use the destructured methods: `const { isGenerating, setIsGenerating } = useMealStore()`
3. Include dependencies in useEffect dependency arrays
4. Use the selector pattern for optimal performance: `const isGenerating = useMealStore(state => state.isGenerating)`

### Store Structure
- **Core state**: Basic state values (isGenerating, mealGenerationComplete, etc.)
- **Actions**: Methods to update state (setIsGenerating, startMealGeneration, etc.)
- **Composite actions**: Methods that update multiple state values atomically
- **Middleware**: logging, hydration tracking, window sync

For migrations of other parts of the app, follow this pattern.