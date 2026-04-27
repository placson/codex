import {
  createUserPlan,
  getUserFinancialProjection,
  getUserPlan,
  updateUserPlan
} from '../services/userPlanService.js';

export async function getUser(request, response, next) {
  try {
    const user = await getUserPlan(request.params.userId);
    response.json(user);
  } catch (error) {
    next(error);
  }
}

export async function createUser(request, response, next) {
  try {
    const savedUser = await createUserPlan(request.body);
    response.status(201).json(savedUser);
  } catch (error) {
    next(error);
  }
}

export async function updateUser(request, response, next) {
  try {
    const updatedUser = await updateUserPlan(request.params.userId, request.body);
    response.json(updatedUser);
  } catch (error) {
    next(error);
  }
}

export async function getProjection(request, response, next) {
  try {
    const projection = await getUserFinancialProjection(request.params.userId);
    response.json(projection);
  } catch (error) {
    next(error);
  }
}
