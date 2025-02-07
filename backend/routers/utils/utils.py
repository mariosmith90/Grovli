import re
from typing import List

def extract_ingredients_from_meal_plan(meal_plan: str) -> List[str]:
    """
    Extracts ingredients from a formatted meal plan text using regex.
    """
    ingredient_section_pattern = re.compile(r"\*\*Ingredients:\*\*\s*(.*?)\n\n", re.DOTALL)
    ingredient_matches = ingredient_section_pattern.findall(meal_plan)

    ingredients = []
    for match in ingredient_matches:
        lines = match.strip().split("\n")
        for line in lines:
            clean_line = line.strip()
            if clean_line and not clean_line.startswith("- "):  # Exclude bullet points if present
                ingredients.append(clean_line)

    return list(set(ingredients))  # Remove duplicates