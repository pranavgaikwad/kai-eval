package com.example;

public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
        
        com.intentional.BadType badType = new com.intentional.BadType();

        if (args.length > 0) {
            System.out.println("Arguments received:");
            for (int i = 0; i < args.length; i++) {
                System.out.println("  [" + i + "] " + args[i]);
            }
        }
    }
}