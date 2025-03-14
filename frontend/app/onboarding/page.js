"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, getAccessToken } from "@auth0/nextjs-auth0";
import Header from '../../components/header';
import Footer from '../../components/footer';

export default function OnboardingWizard() {
  const router = useRouter();
  const { user, isLoading } = useUser();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // User profile data
  const [userData, setUserData] = useState({
    // Step 1: Goals
    goals: [],
    specificGoal: '',
    
    // Step 2: Metrics
    gender: '',
    age: '',
    height: { feet: '', inches: '' },
    current_weight: '',
    goal_weight: '',
    
    // Step 3: Activity
    activity_level: '',
    strength_training: false,
    cardio_frequency: '',
    
    // Step 4: Diet
    dietary_preferences: [],
    food_allergies: [],
    meal_plan_preference: '',
    
    // Step 5: Weight Loss
    weight_loss_speed: '',
    food_restrictions: [],
    
    // Settings to calculate
    calculationMode: 'auto',
    calories: 0,
    carbs: 0,
    protein: 0,
    fat: 0,
    fiber: 0,
    sugar: 0
  });

  useEffect(() => {
    // Redirect to login if not authenticated
    if (!isLoading && !user) {
      router.push('/auth/login?returnTo=/onboarding');
    }
  }, [user, isLoading, router]);

  // Check if all required fields for current step are filled
  const canProceed = () => {
    switch (currentStep) {
      case 1: // Goals
        return userData.goals.length > 0;
      case 2: // Metrics
        return userData.gender && 
               userData.age && 
               userData.current_weight && 
               (userData.height.feet || userData.height.inches);
      case 3: // Activity
        return userData.activity_level !== '';
      case 4: // Diet
        return userData.meal_plan_preference !== '';
      case 5: // Weight Loss
        return userData.weight_loss_speed !== '';
      default:
        return true;
    }
  };

  // Handle change for text and select inputs
  const handleChange = (e) => {
    const { name, value } = e.target;
    
    if (name.includes('.')) {
      // Handle nested fields like height.feet
      const [parent, child] = name.split('.');
      setUserData({
        ...userData,
        [parent]: {
          ...userData[parent],
          [child]: value
        }
      });
    } else {
      setUserData({
        ...userData,
        [name]: value
      });
    }
  };

  // Handle change for checkbox inputs
  const handleCheckboxChange = (e) => {
    const { name, checked } = e.target;
    setUserData({
      ...userData,
      [name]: checked
    });
  };

  // Handle change for multi-select (array) inputs
  const handleArrayChange = (field, value) => {
    // Toggle selection
    const currentValues = [...userData[field]];
    const index = currentValues.indexOf(value);
    
    if (index === -1) {
      currentValues.push(value);
    } else {
      currentValues.splice(index, 1);
    }
    
    setUserData({
      ...userData,
      [field]: currentValues
    });
  };

  // Calculate BMR (Basal Metabolic Rate) using Harris-Benedict Equation
  const calculateBMR = () => {
    // Convert height to cm and weight to kg
    const heightInCm = (Number(userData.height.feet) * 30.48) + (Number(userData.height.inches) * 2.54);
    const weightInKg = Number(userData.current_weight) * 0.453592;
    const age = Number(userData.age);
    
    let bmr = 0;
    
    if (userData.gender === 'male') {
      bmr = 88.362 + (13.397 * weightInKg) + (4.799 * heightInCm) - (5.677 * age);
    } else {
      bmr = 447.593 + (9.247 * weightInKg) + (3.098 * heightInCm) - (4.330 * age);
    }
    
    return Math.round(bmr);
  };

  // Calculate calories based on activity level and goals
  const calculateCalories = () => {
    const bmr = calculateBMR();
    let activityMultiplier = 1.2; // Sedentary
    
    // Set activity multiplier
    switch (userData.activity_level) {
      case 'sedentary':
        activityMultiplier = 1.2;
        break;
      case 'light':
        activityMultiplier = 1.375;
        break;
      case 'moderate':
        activityMultiplier = 1.55;
        break;
      case 'active':
        activityMultiplier = 1.725;
        break;
      case 'very_active':
        activityMultiplier = 1.9;
        break;
      default:
        activityMultiplier = 1.2;
    }
    
    // Calculate TDEE (Total Daily Energy Expenditure)
    let tdee = Math.round(bmr * activityMultiplier);
    
    // Adjust based on goals and weight loss speed
    if (userData.goals.includes('lose_weight')) {
      switch (userData.weight_loss_speed) {
        case 'slow':
          tdee -= 250; // Small deficit
          break;
        case 'moderate':
          tdee -= 500; // Moderate deficit
          break;
        case 'fast':
          tdee -= 750; // Larger deficit
          break;
        default:
          tdee -= 500;
      }
    } else if (userData.goals.includes('gain_muscle')) {
      tdee += 300; // Caloric surplus for muscle gain
    }
    
    // Add extra calories if doing strength training
    if (userData.strength_training) {
      tdee += 100;
    }
    
    // Ensure minimum healthy calorie intake
    const minCalories = userData.gender === 'male' ? 1500 : 1200;
    return Math.max(tdee, minCalories);
  };

  // Calculate macros based on calories and dietary preferences
  const calculateMacros = (calories) => {
    let proteinPercentage = 0.3; // 30% of calories from protein
    let carbPercentage = 0.45; // 45% of calories from carbs
    let fatPercentage = 0.25; // 25% of calories from fat
    
    // Adjust macros for keto diet
    if (userData.dietary_preferences.includes('Keto')) {
      proteinPercentage = 0.25; // 25% protein
      carbPercentage = 0.05; // 5% carbs
      fatPercentage = 0.7; // 70% fat
    }
    // Adjust for higher protein if building muscle
    else if (userData.goals.includes('gain_muscle')) {
      proteinPercentage = 0.35; // 35% protein
      carbPercentage = 0.45; // 45% carbs
      fatPercentage = 0.2; // 20% fat
    }
    
    // Calculate macros in grams
    const protein = Math.round((calories * proteinPercentage) / 4); // 4 calories per gram of protein
    const carbs = Math.round((calories * carbPercentage) / 4); // 4 calories per gram of carbs
    const fat = Math.round((calories * fatPercentage) / 9); // 9 calories per gram of fat
    
    // Calculate fiber (14g per 1000 calories is a good guideline)
    const fiber = Math.round((calories / 1000) * 14);
    
    // Calculate maximum sugar (about 10% of calories)
    const sugar = Math.round((calories * 0.1) / 4);
    
    return { protein, carbs, fat, fiber, sugar };
  };

  // Save the user profile and settings to the server
  const saveUserData = async () => {
    if (!user) {
      router.push('/auth/login?returnTo=/onboarding');
      return;
    }
    
    setLoading(true);
    
    try {
      // Calculate nutrition settings based on user input
      const calculatedCalories = calculateCalories();
      const macros = calculateMacros(calculatedCalories);
      
      // Update userData with calculated values
      const completeUserData = {
        ...userData,
        calculationMode: 'auto',
        calories: calculatedCalories,
        ...macros
      };
      
      setUserData(completeUserData);
      
      // Format userData for storage
      const userProfileToSave = {
        goals: userData.goals,
        specific_goal: userData.specificGoal,
        gender: userData.gender,
        age: parseInt(userData.age),
        height_feet: parseInt(userData.height.feet) || 0,
        height_inches: parseInt(userData.height.inches) || 0,
        current_weight: parseFloat(userData.current_weight),
        goal_weight: userData.goal_weight ? parseFloat(userData.goal_weight) : null,
        activity_level: userData.activity_level,
        strength_training: userData.strength_training,
        cardio_frequency: userData.cardio_frequency || null,
        dietary_preferences: userData.dietary_preferences,
        food_allergies: userData.food_allergies,
        meal_plan_preference: userData.meal_plan_preference,
        weight_loss_speed: userData.weight_loss_speed || null,
        food_restrictions: userData.food_restrictions
      };
      
      // Save profile data to localStorage for immediate use
      localStorage.setItem('userProfileData', JSON.stringify(completeUserData));
      
      // Save the nutrition settings to the user-settings API
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const token = await getAccessToken({
        authorizationParams: {
          audience: "https://grovli.citigrove.com/audience"
        }
      });
      
      if (!token) {
        throw new Error("Failed to retrieve access token.");
      }
      
      // Settings to save to the API
      const settingsToSave = {
        calculationMode: 'auto',
        calories: calculatedCalories,
        protein: macros.protein,
        carbs: macros.carbs,
        fat: macros.fat,
        fiber: macros.fiber,
        sugar: macros.sugar
      };
      
      // Also update localStorage with combined preferences for meal page
      const mealPlanInputs = {
        preferences: userData.dietary_preferences.join(" "),
        mealType: mapMealPreferenceToMealType(userData.meal_plan_preference),
        numDays: 1, // Default to 1 day
        mealPlan: [], 
        displayedMealType: ""
      };
      localStorage.setItem("mealPlanInputs", JSON.stringify(mealPlanInputs));
      
      // Also save settings to localStorage for immediate use in other parts of the app
      localStorage.setItem('globalMealSettings', JSON.stringify(settingsToSave));
      
      // Save settings to the server
      const settingsResponse = await fetch(`${apiUrl}/user-settings/${user.sub}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(settingsToSave)
      });
      
      if (!settingsResponse.ok) {
        throw new Error('Failed to save settings');
      }
      
      // Save user profile to the API
      const profileResponse = await fetch(`${apiUrl}/user-profile/${user.sub}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(userProfileToSave)
      });
      
      if (!profileResponse.ok) {
        throw new Error('Failed to save user profile');
      }
      
      // Redirect to the meal planning page
      router.push('/meals');
      
    } catch (error) {
      console.error('Error saving user data:', error);
      alert('There was an error saving your profile. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const mapMealPreferenceToMealType = (preference) => {
    const mapping = {
      'breakfast': 'Breakfast',
      'lunch': 'Lunch',
      'dinner': 'Dinner',
      'snacks': 'Snack',
      'full_day': 'Full Day'
    };
    
    return mapping[preference] || 'Breakfast';
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (currentStep < 5) {
      // Go to next step
      setCurrentStep(currentStep + 1);
    } else {
      // Save data and complete onboarding
      await saveUserData();
    }
  };

  // Go back to previous step
  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <>
      <Header />
      
      <main className="relative z-10 flex flex-col items-center w-full min-h-screen pt-[4rem] pb-[5rem]">
        <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 shadow-lg w-full max-w-4xl flex-grow flex flex-col">
          <h2 className="text-2xl font-semibold text-gray-800 mb-6">
            Let's Personalize Your Experience
          </h2>
          
          {/* Progress Bar */}
          <div className="w-full mb-8">
            <div className="h-2 bg-gray-200 rounded-full">
              <div 
                className="h-full bg-teal-500 rounded-full transition-all duration-300" 
                style={{ width: `${(currentStep / 5) * 100}%` }}
              ></div>
            </div>
            <div className="flex justify-between mt-2 text-sm text-gray-500">
              <span className={currentStep >= 1 ? "text-teal-600 font-medium" : ""}>Goals</span>
              <span className={currentStep >= 2 ? "text-teal-600 font-medium" : ""}>Metrics</span>
              <span className={currentStep >= 3 ? "text-teal-600 font-medium" : ""}>Activity</span>
              <span className={currentStep >= 4 ? "text-teal-600 font-medium" : ""}>Diet</span>
              <span className={currentStep >= 5 ? "text-teal-600 font-medium" : ""}>Fine-tuning</span>
            </div>
          </div>
          
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
            {/* Step 1: Goals */}
            {currentStep === 1 && (
              <div className="flex-1">
                <h3 className="text-xl font-medium text-gray-800 mb-4">What are your health goals?</h3>
                <p className="text-gray-600 mb-6">Select all that apply to you</p>
                
                <div className="space-y-3 mb-8">
                  {['lose_weight', 'maintain_weight', 'gain_muscle', 'improve_health', 'increase_energy'].map((goal) => {
                    const labels = {
                      lose_weight: 'Lose Weight',
                      maintain_weight: 'Maintain Current Weight',
                      gain_muscle: 'Build Muscle Mass',
                      improve_health: 'Improve Overall Health',
                      increase_energy: 'Increase Energy Levels'
                    };
                    
                    return (
                      <div key={goal} className="flex items-center">
                        <button
                          type="button"
                          onClick={() => handleArrayChange('goals', goal)}
                          className={`px-4 py-3 w-full text-left rounded-lg border-2 ${
                            userData.goals.includes(goal)
                              ? "bg-teal-500 text-white border-teal-600"
                              : "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200"
                          } transition-all`}
                        >
                          {labels[goal]}
                        </button>
                      </div>
                    );
                  })}
                </div>
                
                {userData.goals.includes('lose_weight') && (
                  <div className="mb-6">
                    <label className="block text-gray-700 text-sm font-medium mb-2">
                      What's your specific weight loss goal?
                    </label>
                    <input
                      type="text"
                      name="specificGoal"
                      placeholder="Example: Lose 15 pounds in 3 months"
                      value={userData.specificGoal}
                      onChange={handleChange}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                  </div>
                )}
              </div>
            )}
            
            {/* Step 2: Personal Metrics */}
            {currentStep === 2 && (
              <div className="flex-1">
                <h3 className="text-xl font-medium text-gray-800 mb-4">Tell us about yourself</h3>
                <p className="text-gray-600 mb-6">This helps us calculate your nutritional needs</p>
                
                <div className="space-y-5">
                  {/* Gender Selection */}
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">
                      Gender
                    </label>
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => setUserData({...userData, gender: 'male'})}
                        className={`px-4 py-2 rounded-full border-2 ${
                          userData.gender === 'male'
                            ? "bg-teal-500 text-white border-teal-600"
                            : "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200"
                        } transition-all`}
                      >
                        Male
                      </button>
                      <button
                        type="button"
                        onClick={() => setUserData({...userData, gender: 'female'})}
                        className={`px-4 py-2 rounded-full border-2 ${
                          userData.gender === 'female'
                            ? "bg-teal-500 text-white border-teal-600"
                            : "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200"
                        } transition-all`}
                      >
                        Female
                      </button>
                    </div>
                  </div>
                  
                  {/* Age */}
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">
                      Age
                    </label>
                    <input
                      type="number"
                      name="age"
                      min="18"
                      max="100"
                      placeholder="Your age"
                      value={userData.age}
                      onChange={handleChange}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                  </div>
                  
                  {/* Height */}
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">
                      Height
                    </label>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <input
                          type="number"
                          name="height.feet"
                          min="3"
                          max="8"
                          placeholder="Feet"
                          value={userData.height.feet}
                          onChange={handleChange}
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        />
                      </div>
                      <div className="flex-1">
                        <input
                          type="number"
                          name="height.inches"
                          min="0"
                          max="11"
                          placeholder="Inches"
                          value={userData.height.inches}
                          onChange={handleChange}
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Current Weight */}
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">
                      Current Weight (lbs)
                    </label>
                    <input
                      type="number"
                      name="current_weight"
                      min="70"
                      max="500"
                      placeholder="Your weight in pounds"
                      value={userData.current_weight}
                      onChange={handleChange}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                  </div>
                  
                  {/* Goal Weight (if losing weight) */}
                  {userData.goals.includes('lose_weight') && (
                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-2">
                        Goal Weight (lbs)
                      </label>
                      <input
                        type="number"
                        name="goal_weight"
                        min="70"
                        max="500"
                        placeholder="Your target weight in pounds"
                        value={userData.goal_weight}
                        onChange={handleChange}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Step 3: Activity Level */}
            {currentStep === 3 && (
              <div className="flex-1">
                <h3 className="text-xl font-medium text-gray-800 mb-4">What's your activity level?</h3>
                <p className="text-gray-600 mb-6">This helps determine your calorie needs</p>
                
                <div className="space-y-4 mb-8">
                  {[
                    { id: 'sedentary', label: 'Sedentary (little or no exercise)', description: 'Desk job and little formal exercise' },
                    { id: 'light', label: 'Lightly Active (light exercise 1-3 days/week)', description: 'Light exercise or sports 1-3 days a week' },
                    { id: 'moderate', label: 'Moderately Active (moderate exercise 3-5 days/week)', description: 'Moderate exercise or sports 3-5 days a week' },
                    { id: 'active', label: 'Very Active (hard exercise 6-7 days/week)', description: 'Hard exercise or sports 6-7 days a week' },
                    { id: 'very_active', label: 'Extremely Active (very hard daily exercise or physical job)', description: 'Very hard exercise, physical job, or training twice a day' }
                  ].map((option) => (
                    <div key={option.id} className="flex items-center">
                      <button
                        type="button"
                        onClick={() => setUserData({...userData, activity_level: option.id})}
                        className={`w-full p-4 text-left rounded-lg border-2 ${
                          userData.activity_level === option.id
                            ? "bg-teal-500 text-white border-teal-600"
                            : "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200"
                        } transition-all`}
                      >
                        <div className="font-medium">{option.label}</div>
                        <div className={userData.activity_level === option.id ? "text-teal-100" : "text-gray-500"}>
                          {option.description}
                        </div>
                      </button>
                    </div>
                  ))}
                </div>
                
                {/* Strength Training */}
                <div className="mb-6">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      name="strength_training"
                      checked={userData.strength_training}
                      onChange={handleCheckboxChange}
                      className="w-5 h-5 text-teal-500 border-gray-300 rounded focus:ring-teal-500"
                    />
                    <span className="text-gray-700">I do strength training regularly</span>
                  </label>
                </div>
                
                {/* Cardio Frequency - only show if they do strength training */}
                {userData.strength_training && (
                  <div className="mb-6">
                    <label className="block text-gray-700 text-sm font-medium mb-2">
                      How often do you do cardio?
                    </label>
                    <select
                      name="cardio_frequency"
                      value={userData.cardio_frequency}
                      onChange={handleChange}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    >
                      <option value="">Select frequency</option>
                      <option value="never">Never</option>
                      <option value="rarely">1-2 times per month</option>
                      <option value="sometimes">1-2 times per week</option>
                      <option value="often">3-4 times per week</option>
                      <option value="daily">5+ times per week</option>
                    </select>
                  </div>
                )}
              </div>
            )}
            
            {/* Step 4: Diet Preferences */}
            {currentStep === 4 && (
              <div className="flex-1">
                <h3 className="text-xl font-medium text-gray-800 mb-4">What are your dietary preferences?</h3>
                <p className="text-gray-600 mb-6">Help us create a meal plan that works for you</p>
                
                {/* Dietary Preferences */}
                <div className="mb-6">
                  <label className="block text-gray-700 text-sm font-medium mb-2">
                    Select your eating philosophy (pick one)
                  </label>
                  <div className="flex flex-wrap gap-2 mb-6">
                    {["Clean", "Keto", "Paleo", "Vegan", "Vegetarian"].map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => handleArrayChange('dietary_preferences', option)}
                        className={`px-4 py-2 rounded-full border-2 ${
                          userData.dietary_preferences.includes(option)
                            ? "bg-teal-500 text-white border-teal-600"
                            : "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200"
                        } transition-all`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Cuisine Preferences */}
                <div className="mb-6">
                  <label className="block text-gray-700 text-sm font-medium mb-2">
                    What cuisines do you enjoy? (select all that apply)
                  </label>
                  <div className="flex flex-wrap gap-2 mb-6">
                    {["American", "Asian", "Caribbean", "Indian", "Latin", "Mediterranean"].map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => handleArrayChange('dietary_preferences', option)}
                        className={`px-4 py-2 rounded-full border-2 ${
                          userData.dietary_preferences.includes(option)
                            ? "bg-orange-500 text-white border-orange-600"
                            : "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200"
                        } transition-all`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Food Allergies */}
                <div className="mb-6">
                  <label className="block text-gray-700 text-sm font-medium mb-2">
                    Do you have any food allergies? (select all that apply)
                  </label>
                  <div className="flex flex-wrap gap-2 mb-6">
                    {["Dairy", "Eggs", "Fish", "Shellfish", "Tree Nuts", "Peanuts", "Wheat", "Soy"].map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => handleArrayChange('food_allergies', option)}
                        className={`px-4 py-2 rounded-full border-2 ${
                          userData.food_allergies.includes(option)
                            ? "bg-red-500 text-white border-red-600"
                            : "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200"
                        } transition-all`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Meal Plan Preference */}
                <div className="mb-6">
                  <label className="block text-gray-700 text-sm font-medium mb-2">
                    I want help with planning:
                  </label>
                  <div className="flex flex-wrap gap-3">
                    {[
                      { id: 'breakfast', label: 'Breakfast Only' },
                      { id: 'lunch', label: 'Lunch Only' },
                      { id: 'dinner', label: 'Dinner Only' },
                      { id: 'snacks', label: 'Snacks' },
                      { id: 'full_day', label: 'Full Day Meals' }
                    ].map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setUserData({...userData, meal_plan_preference: option.id})}
                        className={`px-4 py-2 rounded-full border-2 ${
                          userData.meal_plan_preference === option.id
                            ? "bg-teal-500 text-white border-teal-600"
                            : "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200"
                        } transition-all`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            {/* Step 5: Weight Loss Pace */}
            {currentStep === 5 && (
              <div className="flex-1">
                <h3 className="text-xl font-medium text-gray-800 mb-4">Fine-tuning your plan</h3>
                <p className="text-gray-600 mb-6">Let's finalize your personalized approach</p>
                
                {/* Weight Loss Speed - only show if goal is to lose weight */}
                {userData.goals.includes('lose_weight') && (
                  <div className="mb-8">
                    <label className="block text-gray-700 text-sm font-medium mb-2">
                      How quickly do you want to lose weight?
                    </label>
                    <div className="space-y-3">
                      {[
                        { id: 'slow', label: 'Slow and Steady (0.5 lb per week)', description: 'Mild calorie deficit, easier to maintain' },
                        { id: 'moderate', label: 'Moderate (1 lb per week)', description: 'Standard recommended weight loss rate' },
                        { id: 'fast', label: 'Aggressive (1.5-2 lbs per week)', description: 'Larger calorie deficit, may be harder to sustain' }
                      ].map((option) => (
                        <div key={option.id} className="flex items-center">
                          <button
                            type="button"
                            onClick={() => setUserData({...userData, weight_loss_speed: option.id})}
                            className={`w-full p-4 text-left rounded-lg border-2 ${
                              userData.weight_loss_speed === option.id
                                ? "bg-teal-500 text-white border-teal-600"
                                : "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200"
                            } transition-all`}
                          >
                            <div className="font-medium">{option.label}</div>
                            <div className={userData.weight_loss_speed === option.id ? "text-teal-100" : "text-gray-500"}>
                              {option.description}
                            </div>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Food Restrictions */}
                <div className="mb-6">
                  <label className="block text-gray-700 text-sm font-medium mb-2">
                    Are there any foods you want to avoid? (Select all that apply)
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {["Processed Foods", "Added Sugar", "Gluten", "Red Meat", "Alcohol", "Caffeine"].map((option) => (
                      <label key={option} className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={userData.food_restrictions.includes(option)}
                          onChange={() => handleArrayChange('food_restrictions', option)}
                          className="w-4 h-4 text-teal-500 border-gray-300 rounded focus:ring-teal-500 mr-2"
                        />
                        <span className="text-gray-700">{option}</span>
                      </label>
                    ))}
                  </div>
                </div>
                
                {/* Summary Section */}
                <div className="mt-8 p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-800 mb-2">Your Plan Summary</h4>
                  <p className="text-gray-600 text-sm mb-4">
                    Based on your inputs, we've calculated the following nutrition targets:
                  </p>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white p-3 rounded-lg border border-gray-200 text-center">
                      <div className="text-teal-500 text-xl font-bold">{calculateCalories()}</div>
                      <div className="text-gray-500 text-sm">Daily Calories</div>
                    </div>
                    
                    <div className="bg-white p-3 rounded-lg border border-gray-200 text-center">
                      <div className="text-teal-500 text-xl font-bold">{calculateMacros(calculateCalories()).protein}g</div>
                      <div className="text-gray-500 text-sm">Protein</div>
                    </div>
                    
                    <div className="bg-white p-3 rounded-lg border border-gray-200 text-center">
                      <div className="text-teal-500 text-xl font-bold">{calculateMacros(calculateCalories()).carbs}g</div>
                      <div className="text-gray-500 text-sm">Carbs</div>
                    </div>
                  </div>
                  
                  <p className="text-gray-500 text-xs mt-4 text-center">
                    These values will be saved to your profile and used to generate meal plans
                  </p>
                </div>
              </div>
            )}
            
            {/* Navigation Buttons */}
            <div className="mt-auto pt-8 flex justify-between">
              {currentStep > 1 ? (
                <button
                  type="button"
                  onClick={handleBack}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Back
                </button>
              ) : (
                <div></div> // Empty div to maintain spacing with flex justify-between
              )}
              
              <button
                type="submit"
                disabled={!canProceed() || loading}
                className={`px-6 py-3 rounded-lg text-white font-medium transition-colors ${
                  canProceed() && !loading
                    ? "bg-teal-500 hover:bg-teal-600"
                    : "bg-gray-400 cursor-not-allowed"
                }`}
              >
                {loading ? "Saving..." : currentStep === 5 ? "Complete Setup" : "Continue"}
              </button>
            </div>
          </form>
        </div>
      </main>
      
      <Footer />
    </>
  );
}