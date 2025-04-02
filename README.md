# Grovli - Personalized Meal Plan Generation

Grovli is a full-stack application that generates personalized meal plans based on user preferences, dietary requirements, and nutritional goals. The application uses AI to create tailored meal plans and recipes, while also providing shopping lists and ingredient management.

## Architecture Overview

The Grovli application consists of several interconnected services:

```
┌────────────┐     ┌────────────┐     ┌────────────┐
│  Frontend  │────▶│  Backend   │────▶│  AI Models │
│  (Next.js) │◀────│  (FastAPI) │◀────│  (Gemini)  │
└────────────┘     └────────────┘     └────────────┘
      │                  │                   │
      │                  │                   │
      │                  ▼                   │
      │          ┌────────────┐              │
      │          │  MongoDB   │              │
      │          │ (Recipes,  │              │
      │          │  Users)    │              │
      │          └────────────┘              │
      │                  ▲                   │
      │                  │                   │
      ▼                  ▼                   ▼
┌────────────┐     ┌────────────┐     ┌────────────┐
│   Redis    │     │   Celery   │     │   Vertex   │
│  (Caching, │◀───▶│  (Async    │◀───▶│    AI      │
│   Tasks)   │     │   Tasks)   │     │  (Images)  │
└────────────┘     └────────────┘     └────────────┘
```

## Core Components

### Frontend
- **Framework**: Next.js with React
- **State Management**: Zustand for global state, React hooks for local state
- **Authentication**: Auth0 integration
- **Styling**: TailwindCSS for utility-first styling
- **Key Features**:
  - Interactive meal plan generation
  - Recipe viewing and saving
  - Shopping list creation
  - User profile management

### Backend
- **Framework**: FastAPI (Python)
- **API Routes**: RESTful endpoints for all application functionality
- **Background Processing**: Celery for asynchronous task processing
- **Authentication**: JWT validation via Auth0
- **Key Features**:
  - AI-powered meal plan generation
  - Recipe storage and retrieval
  - User data management
  - Webhook notifications

### Databases
- **MongoDB**: Primary database for storing:
  - User profiles
  - Meal plans
  - Recipes
  - Shopping lists
  - Chat sessions

- **Redis**: Used for:
  - Caching AI responses
  - Task queue management
  - Session data
  - Real-time notifications

### AI Integration
- **Google Gemini AI**: Used for recipe generation and meal planning
- **Vertex AI**: Used for generating food images for recipes

### Payment Processing
- **Stripe**: Integrated for premium subscription management

## Application State Management

### Zustand Store Architecture
The application uses Zustand for centralized state management, particularly for meal generation and tracking.

**Key stores:**
- **mealStore**: Manages meal plan generation state
  - Tracks generation status (isGenerating, mealGenerationComplete)
  - Stores meal plan data
  - Manages job IDs and task tracking
  - Provides hydration awareness for SSR

**State Flow for Meal Generation:**
1. User selects meal preferences and initiates generation
2. Frontend sends request to backend and updates Zustand state
3. Backend processes request via Celery task queue
4. AI generates recipes and stores them in MongoDB
5. Backend sends webhook notification when complete
6. Frontend polls for completion or receives webhook
7. Zustand store updates with completed meal plan
8. UI refreshes to display results

### Asynchronous Processing
Meal plan generation follows this process:
1. **Immediate Check**: Backend attempts quick generation
2. **Background Processing**: If not immediate, Celery handles task
3. **Webhook Notification**: Backend notifies frontend when complete
4. **Polling Fallback**: Frontend polls for status if webhook fails
5. **State Updates**: Zustand store handles all state transitions

### Browser Storage Strategy
- **Zustand Persist**: Primary storage mechanism
  - Uses localStorage for persistence
  - Handles hydration for server/client state matching
  - Manages all critical application state

- **Helper Functions**: Bridge between localStorage and Zustand
  - Maintain backward compatibility with direct localStorage access
  - Ensure synchronization between storage methods

## Docker Containerization

The application is fully containerized with Docker:

- **Frontend**: Node.js container for Next.js
- **Backend**: Python container for FastAPI
- **Redis**: Standard Redis container
- **MongoDB**: MongoDB container with persistent volume
- **Payments**: Separate service for payment processing

Docker Compose orchestrates these containers for easy development and deployment.

## Development Workflow

1. **Local Development**:
   ```bash
   docker-compose up -d
   ```

2. **Running Frontend Only**:
   ```bash
   cd frontend
   npm run dev
   ```

3. **Running Backend Only**:
   ```bash
   cd backend
   uvicorn app.main:app --reload
   ```

## Key Features

- **AI-Powered Meal Planning**: Generate personalized meal plans based on preferences
- **Multi-Day Plans**: Create plans for multiple days (Premium feature)
- **Full Day Nutrition**: Generate full day meal plans with balanced nutrition
- **Recipe Saving**: Save favorite recipes to profile
- **Shopping Lists**: Generate shopping lists from meal plans
- **Pantry Management**: Track ingredients in pantry
- **Nutritional Analysis**: View detailed nutritional information for meals

## Deployment

The application is designed for cloud deployment using:
- **Container Orchestration**: Kubernetes or Docker Swarm
- **Load Balancing**: Nginx for request distribution
- **SSL Termination**: Configured via deployment platform
- **Scaling**: Horizontal scaling for API and worker nodes

## Security Features

- **Authentication**: Auth0 integration with JWT validation
- **Authorization**: Role-based access control
- **Data Protection**: Input sanitization and validation
- **API Security**: Rate limiting and token validation
- **Secrets Management**: Environment variables for sensitive info

## Monitoring and Logging

- **Application Logging**: Structured logging in all components
- **Error Tracking**: Detailed error recording
- **Performance Monitoring**: Request timing and processing metrics
- **Health Checks**: Endpoint status monitoring

---

For more detailed information on specific components, please refer to the documentation in the respective directories:
- [Frontend Documentation](/frontend/README.md)
- [Backend Documentation](/backend/README.md)
- [Payments Service](/payments/README.md)